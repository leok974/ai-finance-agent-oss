## ------------------------------------------------------------------
## Backend Dockerfile (multi-stage, distroless runtime)
## ------------------------------------------------------------------
FROM python:3.11-slim AS builder
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG VERSION=dev
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /w

COPY requirements.txt ./
# Install dependencies directly (faster + simpler than wheel copy -> pip install in distroless)
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . /w/src

# Python runtime entry script (handles Alembic upgrade then launches uvicorn)
RUN printf 'import subprocess,sys\nimport time\ncmd_primary=[sys.executable,"-m","alembic","-c","/app/alembic.ini","upgrade","head"]\ncmd_fallback=[sys.executable,"-m","alembic","-c","/app/alembic.ini","upgrade","heads"]\nfor idx,cmd in enumerate((cmd_primary,cmd_fallback)):\n try:\n  subprocess.run(cmd,check=True)\n  break\n except Exception as e:\n  label="primary" if idx==0 else "fallback"\n  print(f"[run] {label} alembic upgrade failed: {e}",flush=True)\n# Launch uvicorn\nsubprocess.run([sys.executable,"-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--proxy-headers","--forwarded-allow-ips=*"])\n' > /w/run_app.py

## ------------------------------------------------------------------
## Runtime stage (distroless python)
## ------------------------------------------------------------------
FROM gcr.io/distroless/python3-debian12 AS runtime
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG VERSION=dev
ENV GIT_BRANCH=${GIT_BRANCH} GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} \
    APP_VERSION=${VERSION} APP_COMMIT=${GIT_COMMIT} APP_BUILD_TIME=${BUILD_TIME} \
    PYTHONPATH=/usr/local/lib/python3.11/site-packages:/app
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /w/src /app
COPY --from=builder /w/run_app.py /run_app.py
USER 10001:10001
EXPOSE 8000
ENTRYPOINT ["python","/run_app.py"]

LABEL org.opencontainers.image.title="LedgerMind Backend" \
    org.opencontainers.image.source="https://github.com/leok974/ai-finance-agent-oss" \
    org.opencontainers.image.revision="$GIT_COMMIT" \
    org.opencontainers.image.version="$GIT_BRANCH" \
    org.opencontainers.image.created="$BUILD_TIME" \
    org.opencontainers.image.version.app="$VERSION"
