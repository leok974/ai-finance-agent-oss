FROM node:20

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install deps first (better cache). Paths are relative to build context: apps/web
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# Copy the rest
COPY . .

EXPOSE 5173
CMD ["pnpm","vite","--host"]
