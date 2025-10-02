# elysia-agui-gateway/Dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json .
COPY bun.lockb* ./
COPY tsconfig.json ./

RUN if [ -f bun.lockb ]; then bun install --frozen-lockfile; else bun install; fi

# Now copy source
COPY server.ts ./

ENV NODE_ENV=production
EXPOSE 3030
CMD ["bun", "run", "server.ts"]
