## ------------------------------------------------------------------
## Backend Dockerfile (optimized multi-stage, slim runtime)
## Goal: shrink ~20GB distroless image to a few hundred MB by:
##  - Building wheels separately (optional) or direct install with cache mount
##  - Using python:3.11-slim for final stage (includes interpreter & certs)
##  - Removing build tooling & caches
##  - Dropping tests/__pycache__ from site-packages
##  - Running as non-root
## ------------------------------------------------------------------

FROM python:3.11-slim AS builder
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG VERSION=dev
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /w

RUN apt-get update && apt-get install -y --no-install-recommends build-essential gcc git && rm -rf /var/lib/apt/lists/*

COPY apps/backend/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy only application source (avoid copying local venvs etc.)
COPY apps/backend /w/src

# Build stamp
RUN printf '{"branch":"%s","commit":"%s","build_time":"%s"}' "$GIT_BRANCH" "$GIT_COMMIT" "$BUILD_TIME" > /w/src/build-stamp.json

# Generate run script (alembic migrate -> uvicorn)
RUN printf 'import subprocess,sys\ncmd_primary=[sys.executable,"-m","alembic","-c","/app/alembic.ini","upgrade","head"]\ncmd_fallback=[sys.executable,"-m","alembic","-c","/app/alembic.ini","upgrade","heads"]\nfor idx,cmd in enumerate((cmd_primary,cmd_fallback)):\n try:\n  subprocess.run(cmd,check=True)\n  break\n except Exception as e:\n  label="primary" if idx==0 else "fallback"\n  print(f"[run] {label} alembic upgrade failed: {e}",flush=True)\nsubprocess.run([sys.executable,"-m","uvicorn","app.main:app","--host","0.0.0.0","--port","8000","--proxy-headers","--forwarded-allow-ips=*"])\n' > /w/run_app.py

## ------------------------------------------------------------------
## Runtime stage
## ------------------------------------------------------------------
FROM python:3.11-slim AS runtime
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG VERSION=dev
ENV GIT_BRANCH=${GIT_BRANCH} GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} \
    APP_VERSION=${VERSION} APP_COMMIT=${GIT_COMMIT} APP_BUILD_TIME=${BUILD_TIME} \
    PYTHONPATH=/usr/local/lib/python3.11/site-packages:/app \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# Install runtime dependencies for LightGBM (libgomp for OpenMP)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

# Copy installed site-packages & app
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=builder /w/src /app
COPY --from=builder /w/run_app.py /run_app.py

# Prune tests and caches to reduce size
RUN find /usr/local/lib/python3.11/site-packages -type d -name "tests" -prune -exec rm -rf {} + || true \
 && find /usr/local/lib/python3.11/site-packages -type d -name "__pycache__" -prune -exec rm -rf {} + || true \
 && rm -rf /root/.cache /app/.pytest_cache /app/.mypy_cache || true

# Create non-root user
RUN useradd -u 10001 -r -s /usr/sbin/nologin appuser && chown -R 10001:10001 /app
USER 10001:10001

EXPOSE 8000
ENTRYPOINT ["python","/run_app.py"]

LABEL org.opencontainers.image.title="LedgerMind Backend" \
    org.opencontainers.image.source="https://github.com/leok974/ai-finance-agent-oss" \
    org.opencontainers.image.revision="$GIT_COMMIT" \
    org.opencontainers.image.version="$GIT_BRANCH" \
    org.opencontainers.image.created="$BUILD_TIME" \
    org.opencontainers.image.version.app="$VERSION"
