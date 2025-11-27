# Deploy Backend Slimming Template

A multi-stage pattern to shrink the large deploy-backend image (~20GB) while preserving functionality.

## Goals
- Deterministic builds (pin deps)
- Minimal runtime (only site-packages + app code)
- Non-root execution
- No build toolchain leakage (gcc, headers) into final stage

## Outline Dockerfile

```Dockerfile
# --- Builder -------------------------------------------------------
FROM python:3.11-slim AS builder
ARG PIP_DISABLE_PIP_VERSION_CHECK=1
ARG PYTHONDONTWRITEBYTECODE=1
ARG PYTHONUNBUFFERED=1

# System build deps (remove in runtime)
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential gcc \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Support either pyproject/poetry.lock or requirements*.txt
COPY pyproject.toml poetry.lock* requirements*.txt* ./

# (Choose ONE path below)
# 1) Requirements: uncomment if using plain requirements.txt
# RUN pip install --no-cache-dir -r requirements.txt --target /wheelhouse
# 2) Poetry export (if poetry used):
# RUN pip install --no-cache-dir poetry \
#  && poetry export -f requirements.txt --output req.txt --without-hashes \
#  && pip install --no-cache-dir -r req.txt --target /wheelhouse

# Copy only runtime code (exclude tests, docs, migrations if not needed at runtime)
COPY src/ ./src/
# COPY alembic ./alembic   # only if migrations invoked inside container

# Optional: prune bytecode or large artifacts
# find /wheelhouse -name "*.pyc" -delete

# --- Runtime -------------------------------------------------------
FROM python:3.11-slim AS runtime
ARG PIP_DISABLE_PIP_VERSION_CHECK=1
ARG PYTHONDONTWRITEBYTECODE=1
ARG PYTHONUNBUFFERED=1

# (Optional) install tiny runtime utilities if needed (curl, bash)
# RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -m -u 10001 appuser

WORKDIR /app
ENV PYTHONPATH=/app

# Copy site-packages and app code
COPY --from=builder /wheelhouse /usr/local/lib/python3.11/site-packages
COPY --from=builder /app/src /app/src
# COPY --from=builder /app/alembic /app/alembic  # if needed

USER appuser
EXPOSE 8000

# Health or metrics endpoints should already be in the app
CMD ["python", "-m", "src.main"]  # Adjust to real entry point
```

## Additional Tips
- Use `pip install --no-cache-dir` to avoid wheel caches inflating layers.
- If image still large, audit largest dirs: `docker run --rm <image> sh -lc 'du -sh /usr/local/lib/python3.11/site-packages/* | sort -h | tail -n 30'`.
- Consider optional `--platform=linux/amd64` for reproducibility across builders.
- If native libs heavy (e.g., numpy/pandas) and you don't need them at runtime, move analytics elsewhere.
- Distroless path (advanced): stage from `gcr.io/distroless/python3-debian12` and only copy `/usr/local/lib/python3.11/site-packages` plus your app + `/usr/local/bin/python` symlinked libs (requires careful ldd walk).
- Multi-arch: add `ARG TARGETARCH` if building for multiple architectures that need conditional wheels.

## Validation Checklist
- [ ] Application starts (`python -m src.main` or uvicorn entrypoint) inside slim image
- [ ] All migrations run externally or included intentionally
- [ ] No placeholder test/data files shipped
- [ ] Non-root user effective (check `id -u`)
- [ ] CSP / networking unaffected (edge container separate)

## Next Steps
1. Copy this template to the deploy backend Dockerfile.
2. Replace requirements install section with the project's actual dependency method.
3. Incrementally test: build, run, hit health endpoint.
4. Add size comparison before/after.
5. Push changes and monitor runtime for missing native deps.
