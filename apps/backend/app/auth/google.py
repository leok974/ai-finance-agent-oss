import os
import secrets
import base64
import hashlib
import logging
import time
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from authlib.integrations.starlette_client import OAuth
from starlette.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import User, UserRole, Role, OAuthAccount
from app.utils.auth import create_tokens, set_auth_cookies
from app.utils.csrf import issue_csrf_cookie

logger = logging.getLogger("auth.google")
router = APIRouter(prefix="/api/auth/google", tags=["auth"])

# Prometheus metrics for OAuth monitoring
try:
    from prometheus_client import Counter, Histogram

    auth_callback_total = Counter(
        "auth_callback_total",
        "Total OAuth callback attempts",
        ["result"],  # ok, error, state_mismatch, token_exchange_failed
    )
    oauth_token_exchange_seconds = Histogram(
        "oauth_token_exchange_seconds", "Time spent in OAuth token exchange"
    )
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False
    auth_callback_total = None  # type: ignore[assignment]
    oauth_token_exchange_seconds = None  # type: ignore[assignment]

GOOGLE_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration"
CLIENT_ID = os.getenv("OAUTH_GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("OAUTH_GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv(
    "OAUTH_REDIRECT_URL", "https://app.ledger-mind.org/api/auth/google/callback"
)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    server_metadata_url=GOOGLE_DISCOVERY,
    client_kwargs={"scope": "openid email profile"},
)  # type: ignore[attr-defined]


def _pkce_pair():
    verifier = base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


@router.get("/login")
async def login(request: Request):
    # CSRF state + PKCE
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce_pair()

    request.session["oauth_state"] = state
    request.session["oauth_pkce_verifier"] = verifier

    logger.info(
        "OAuth login: set state + pkce in session; redirect_uri=%s", REDIRECT_URI
    )

    # Accept optional prompt parameter (e.g. "select_account", "consent", "login")
    prompt = request.query_params.get("prompt")
    extra = {}
    if prompt:
        extra["prompt"] = prompt
        logger.info("OAuth login: prompt=%s", prompt)

    return await oauth.google.authorize_redirect(  # type: ignore[union-attr]
        request,
        redirect_uri=REDIRECT_URI,
        state=state,
        code_challenge=challenge,
        code_challenge_method="S256",
        **extra,
    )


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    start_time = time.time() if METRICS_ENABLED else None
    try:
        # Debug: log all cookies and session data
        cookies = request.cookies
        session_data = dict(request.session)
        print(f"[OAUTH DEBUG] Cookies: {list(cookies.keys())}", flush=True)
        print(f"[OAUTH DEBUG] Session keys: {list(session_data.keys())}", flush=True)
        print(
            f"[OAUTH DEBUG] oauth_state in session: {session_data.get('oauth_state')}",
            flush=True,
        )

        # 1) Validate state
        state_qs = request.query_params.get("state")
        state_sess = request.session.get("oauth_state")
        print(f"[OAUTH DEBUG] State from query: {state_qs}", flush=True)
        print(f"[OAUTH DEBUG] State from session: {state_sess}", flush=True)

        if not state_qs or not state_sess or state_qs != state_sess:
            if METRICS_ENABLED:
                auth_callback_total.labels(result="state_mismatch").inc()  # type: ignore[union-attr]
            logger.error(
                "OAuth callback: state mismatch: qs=%s session=%s", state_qs, state_sess
            )
            raise HTTPException(status_code=400, detail="OAuth state mismatch")

        verifier = request.session.get("oauth_pkce_verifier")
        print(
            f"[OAUTH DEBUG] PKCE verifier: {verifier[:20] if verifier else None}...",
            flush=True,
        )
        if not verifier:
            logger.error("OAuth callback: missing PKCE verifier in session")
            raise HTTPException(status_code=400, detail="OAuth PKCE verifier missing")

        # 2) Exchange code (+PKCE)
        print("[OAUTH DEBUG] Starting token exchange...", flush=True)
        try:
            if METRICS_ENABLED and oauth_token_exchange_seconds:
                with oauth_token_exchange_seconds.time():  # type: ignore[union-attr]
                    token = await oauth.google.authorize_access_token(  # type: ignore[union-attr]
                        request, code_verifier=verifier
                    )
            else:
                token = await oauth.google.authorize_access_token(  # type: ignore[union-attr]
                    request, code_verifier=verifier
                )
            print("[OAUTH DEBUG] Token exchange SUCCESS!", flush=True)
        except Exception as e:
            if METRICS_ENABLED:
                auth_callback_total.labels(result="token_exchange_failed").inc()  # type: ignore[union-attr]
            # Capture Google's exact error response
            resp = getattr(e, "response", None)
            status = getattr(resp, "status_code", None)
            body = ""
            try:
                if resp is not None:
                    body = await resp.text()
            except Exception:
                body = str(e)

            print(f"[OAUTH ERROR] Token exchange failed: {e}", flush=True)
            print(f"[OAUTH ERROR] Exception type: {type(e).__name__}", flush=True)
            print(f"[OAUTH ERROR] HTTP Status: {status}", flush=True)
            print(f"[OAUTH ERROR] Response body: {body}", flush=True)

            logger.error(
                "OAUTH TOKEN EXCHANGE FAILED status=%s body=%s exception=%s",
                status,
                body,
                e,
            )
            return JSONResponse(
                {"detail": "OAuth token exchange failed"}, status_code=400
            )

        # Guard against string token (bad/mangled response)
        if isinstance(token, str):
            logger.error("Token came back as string (not JSON): %s", token)
            raise HTTPException(status_code=400, detail="OAuth token parse error")

        print("[OAUTH DEBUG] Fetching userinfo...", flush=True)
        logger.info("OAuth token OK; fetching userinfo")
        # 3) Fetch profile
        try:
            # Try to parse id_token if present, otherwise fetch from userinfo endpoint
            userinfo = None
            if "id_token" in token:
                try:
                    userinfo = await oauth.google.parse_id_token(request, token)
                except Exception as e:
                    logger.warning(
                        "Failed to parse id_token, falling back to userinfo endpoint: %s",
                        e,
                    )

            # Fallback: userinfo endpoint if id_token parsing failed or not present
            if not userinfo:
                resp = await oauth.google.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo", token=token
                )
                userinfo = resp.json()
        except Exception as e:
            logger.exception("Userinfo fetch failed: %s", e)
            raise HTTPException(status_code=400, detail="OAuth userinfo failed")

        email = userinfo.get("email")
        if not email:
            logger.error("No email in OAuth userinfo: %s", userinfo)
            raise HTTPException(status_code=400, detail="No email from OAuth provider")

        # Extract Google's unique user ID (sub claim)
        google_sub = userinfo.get("sub")
        if not google_sub:
            logger.error("No sub (user ID) in OAuth userinfo: %s", userinfo)
            raise HTTPException(
                status_code=400, detail="No user ID from OAuth provider"
            )

        print(f"[OAUTH DEBUG] Got email: {email}, sub: {google_sub}", flush=True)

        # Extract name and picture from userinfo
        name = userinfo.get("name")
        picture = userinfo.get("picture")

        print(
            "[OAUTH DEBUG] Creating/updating user and OAuth account in database...",
            flush=True,
        )

        # 4) Check for existing OAuth account first (primary key: provider + provider_user_id)
        oauth_account = (
            db.query(OAuthAccount)
            .filter(
                OAuthAccount.provider == "google",
                OAuthAccount.provider_user_id == google_sub,
            )
            .first()
        )

        if oauth_account:
            # OAuth account exists - get the linked user
            user = db.query(User).filter(User.id == oauth_account.user_id).first()
            if not user:
                logger.error(
                    "OAuth account exists but linked user not found: %s",
                    oauth_account.user_id,
                )
                raise HTTPException(
                    status_code=400, detail="Account configuration error"
                )

            # Update user profile if changed
            updated = False
            if name and user.name != name:
                user.name = name
                updated = True
            if picture and user.picture != picture:
                user.picture = picture
                updated = True
            if email and user.email != email:
                # Email changed in Google account
                user.email = email
                oauth_account.email = email
                updated = True

            if updated:
                db.commit()
                db.refresh(user)
                logger.info("Updated user profile via OAuth: %s", email)
        else:
            # No OAuth account - check if user exists by email
            user = db.query(User).filter(User.email == email).first()

            # Safety check: Never link OAuth to demo user accounts
            if user and (user.is_demo or user.is_demo_user):
                logger.error(
                    "Attempted to link OAuth to demo user account: %s (is_demo=%s, is_demo_user=%s)",
                    email,
                    user.is_demo,
                    user.is_demo_user,
                )
                raise HTTPException(
                    status_code=400,
                    detail="This email is reserved for demo purposes. Please use a different email address.",
                )

            if not user:
                # Create new user
                user = User(
                    email=email,
                    password_hash="",  # OAuth users don't have passwords
                    is_active=True,
                    name=name,
                    picture=picture,
                    is_demo=False,  # Real users are never demo
                )
                db.add(user)
                db.flush()  # Get user.id

                # Assign default "user" role
                user_role = db.query(Role).filter(Role.name == "user").first()
                if not user_role:
                    user_role = Role(name="user")
                    db.add(user_role)
                    db.flush()

                user_role_link = UserRole(user_id=user.id, role_id=user_role.id)
                db.add(user_role_link)
                logger.info("Created new user via OAuth: %s", email)
            else:
                # User exists - update profile
                updated = False
                if name and user.name != name:
                    user.name = name
                    updated = True
                if picture and user.picture != picture:
                    user.picture = picture
                    updated = True
                if updated:
                    logger.info("Updated existing user profile via OAuth: %s", email)

            # Create OAuth account link
            oauth_account = OAuthAccount(
                user_id=user.id,
                provider="google",
                provider_user_id=google_sub,
                email=email,
            )
            db.add(oauth_account)
            logger.info(
                "Created OAuth account link for user: %s (provider=google, sub=%s)",
                email,
                google_sub,
            )

            db.commit()
            db.refresh(user)

        # 5) Get user roles
        roles = [ur.role.name for ur in user.roles]
        print(f"[OAUTH DEBUG] User roles: {roles}", flush=True)

        # 6) Create JWT tokens
        print("[OAUTH DEBUG] Creating JWT tokens...", flush=True)
        tokens = create_tokens(email, roles)
        print("[OAUTH DEBUG] JWT tokens created", flush=True)

        # 7) Clean up OAuth session data
        request.session.pop("oauth_state", None)
        request.session.pop("oauth_pkce_verifier", None)

        logger.info("OAuth success for %s", email)

        # 8) Set auth cookies and redirect
        print("[OAUTH DEBUG] Setting auth cookies and redirecting to /", flush=True)
        response = RedirectResponse(url="/", status_code=307)
        set_auth_cookies(response, tokens)
        issue_csrf_cookie(response)  # Add CSRF cookie for authenticated requests
        print("[OAUTH DEBUG] OAuth flow complete!", flush=True)

        # Track successful OAuth callback
        if METRICS_ENABLED:
            auth_callback_total.labels(result="ok").inc()  # type: ignore[union-attr]
            if start_time:
                duration = time.time() - start_time
                logger.info(f"OAuth callback completed in {duration:.2f}s")

        return response

    except HTTPException:
        # Re-raise HTTPException (400, 401, etc.) as-is
        if METRICS_ENABLED:
            auth_callback_total.labels(result="error").inc()
        print("[OAUTH ERROR] HTTPException raised in callback", flush=True)
        raise
    except Exception as e:
        # Catch any unexpected errors and log with full traceback
        if METRICS_ENABLED:
            auth_callback_total.labels(result="error").inc()
        print(f"[OAUTH ERROR] Unexpected exception: {e}", flush=True)
        print(f"[OAUTH ERROR] Exception type: {type(e).__name__}", flush=True)
        logger.exception("OAuth callback failed with unexpected error: %s", e)
        # Return 400 instead of 500 to avoid exposing internal errors
        raise HTTPException(
            status_code=400,
            detail="OAuth callback error - please try again or contact support",
        )


@router.get("/logout")
@router.post("/logout")
async def logout(request: Request):
    from app.utils.auth import clear_auth_cookies

    # Clear session data (if any)
    request.session.pop("user", None)
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_pkce_verifier", None)

    # Clear JWT cookies
    response = RedirectResponse(url="/", status_code=302)
    clear_auth_cookies(response)

    logger.info("User logged out")
    return response
