from authlib.integrations.starlette_client import OAuth
from fastapi import Request
from app.utils.env import get_env

oauth = OAuth()
oauth.register(
    name="github",
    client_id=get_env("OAUTH_GITHUB_CLIENT_ID"),
    client_secret=get_env("OAUTH_GITHUB_CLIENT_SECRET"),
    access_token_url="https://github.com/login/oauth/access_token",
    authorize_url="https://github.com/login/oauth/authorize",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "read:user user:email"},
)
oauth.register(
    name="google",
    client_id=get_env("OAUTH_GOOGLE_CLIENT_ID"),
    client_secret=get_env("OAUTH_GOOGLE_CLIENT_SECRET"),
    access_token_url="https://oauth2.googleapis.com/token",
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    api_base_url="https://www.googleapis.com/oauth2/v3/",
    client_kwargs={"scope": "openid email profile", "prompt": "consent"},
)

def absolute_url(request: Request, path: str) -> str:
    base = str(request.base_url).rstrip("/")
    return base + path
