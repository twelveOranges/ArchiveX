FROM node:20-alpine

WORKDIR /app

# Install pnpm and tar
RUN corepack enable && corepack prepare pnpm@latest --activate && apk add --no-cache tar

# Copy workspace config
COPY pnpm-workspace.yaml package.json .npmrc ./

# Copy package.json files for all packages
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source code
COPY packages/core/ ./packages/core/
COPY packages/ui/ ./packages/ui/
COPY packages/web/ ./packages/web/

# Build
RUN pnpm --filter @archivex/core build && pnpm --filter @archivex/web build

# Default data directory (mount a volume here)
RUN mkdir -p /data

ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/web/server.js"]
