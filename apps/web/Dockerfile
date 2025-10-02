#### Multi-stage Dockerfile: build (Vite) -> runtime (nginx)

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /w
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@latest --activate \
	&& pnpm install --frozen-lockfile
COPY . .
# Generate dynamic build stamp (branch/commit) then build
RUN node scripts/build-stamp.mjs && pnpm build

# ---- runtime ----
FROM nginx:1.27-alpine

# Minimal, non-root, hardened runtime user (uid 101) for nginx master/workers.
# If uid 101 already exists, adduser will fail; use a guard pattern.
RUN adduser -D -u 101 web 2>/dev/null || true \
	&& rm -rf /usr/share/nginx/html/* \
	&& mkdir -p /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp /var/run/nginx \
	&& chown -R 101:101 /var/cache/nginx /var/run /etc/nginx

# Configure nginx to place pid in writable location for non-root user (override default)
# Provide custom root-level nginx configuration with explicit writable pid path
COPY nginx-root.conf /etc/nginx/nginx.conf

COPY --from=build /w/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O - http://127.0.0.1:8080/_up || exit 1

# Drop to non-root
USER 101:101

# Minimal run command (nginx default CMD)
