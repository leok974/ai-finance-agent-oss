# elysia-agui-gateway/Dockerfile
FROM oven/bun:1.2
WORKDIR /app
COPY server.ts ./
ENV NODE_ENV=production
EXPOSE 3030
CMD ["bun", "run", "server.ts"]
