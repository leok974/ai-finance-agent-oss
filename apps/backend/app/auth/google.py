import os
import secrets
import base64
import hashlib
import logging
from fastapi import APIRouter, Request, HTTPException, Depends
from authlib.integrations.starlette_client import OAuth
from starlette.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.db import get_db
from app.orm_models import User, UserRole, Role
from app.utils.auth import create_tokens, set_auth_cookies

logger = logging.getLogger("auth.google")
router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration"
CLIENT_ID = os.getenv("OAUTH_GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("OAUTH_GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv(
    "OAUTH_REDIRECT_URL", "http://127.0.0.1:8000/api/auth/google/callback"
)

oauth = OAuth()
oauth.register(
    name="google",
    client_id=CLIENT_ID,
    client_secret=CLIENT_SECRET,
    server_metadata_url=GOOGLE_DISCOVERY,
    client_kwargs={"scope": "openid email profile"},
)


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

    return await oauth.google.authorize_redirect(
        request,
        redirect_uri=REDIRECT_URI,
        state=state,
        code_challenge=challenge,
        code_challenge_method="S256",
        **extra,
    )


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    # 1) Validate state
    state_qs = request.query_params.get("state")
    state_sess = request.session.get("oauth_state")
    if not state_qs or not state_sess or state_qs != state_sess:
        logger.error(
            "OAuth callback: state mismatch: qs=%s session=%s", state_qs, state_sess
        )
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    verifier = request.session.get("oauth_pkce_verifier")
    if not verifier:
        logger.error("OAuth callback: missing PKCE verifier in session")
        raise HTTPException(status_code=400, detail="OAuth PKCE verifier missing")

    try:
        # 2) Exchange code (+PKCE)
        token = await oauth.google.authorize_access_token(
            request, code_verifier=verifier
        )
    except Exception as e:
        # Try to print raw response if present (Authlib stores it on .response / .error)
        raw = getattr(e, "response", None)
        text = ""
        if raw is not None:
            try:
                text = await raw.text()
            except Exception:
                pass
        logger.exception("OAuth token exchange failed: %s; raw=%s", e, text)
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    # Guard against string token (bad/mangled response)
    if isinstance(token, str):
        logger.error("Token came back as string (not JSON): %s", token)
        raise HTTPException(status_code=400, detail="OAuth token parse error")

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
                    "Failed to parse id_token, falling back to userinfo endpoint: %s", e
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

    # Extract name and picture from userinfo
    name = userinfo.get("name")
    picture = userinfo.get("picture")

    # 4) Get or create user in database
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Create new user
        user = User(
            email=email,
            password_hash="",  # OAuth users don't have passwords
            is_active=True,
            name=name,
            picture=picture,
        )
        db.add(user)
        db.flush()  # Get user.id

        # Assign default "user" role
        user_role = db.query(Role).filter(Role.name == "user").first()
        if not user_role:
            user_role = Role(name="user", description="Standard user")
            db.add(user_role)
            db.flush()

        user_role_link = UserRole(user_id=user.id, role_id=user_role.id)
        db.add(user_role_link)
        db.commit()
        db.refresh(user)
        logger.info("Created new user: %s", email)
    else:
        # Update existing user's name and picture if they changed
        updated = False
        if name and user.name != name:
            user.name = name
            updated = True
        if picture and user.picture != picture:
            user.picture = picture
            updated = True
        if updated:
            db.commit()
            db.refresh(user)
            logger.info("Updated user profile: %s", email)

    # 5) Get user roles
    roles = [ur.role.name for ur in user.roles]

    # 6) Create JWT tokens
    tokens = create_tokens(email, roles)

    # 7) Clean up OAuth session data
    request.session.pop("oauth_state", None)
    request.session.pop("oauth_pkce_verifier", None)

    logger.info("OAuth success for %s", email)

    # 8) Set auth cookies and redirect
    response = RedirectResponse(url="/", status_code=307)
    set_auth_cookies(response, tokens)
    return response


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
