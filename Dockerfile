FROM node:26.3.0-alpine

WORKDIR /app

# Install pnpm, tar and git
RUN npm install -g pnpm && apk add --no-cache tar git

# Clone source code from git
RUN git clone https://gitee.com/zhangbo97/ArchiveX.git .

# Install dependencies (ignore build scripts to avoid approval prompt)
RUN pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts

# Build
RUN pnpm --filter @archivex/core build && pnpm --filter @archivex/web build

# Default data directory (mount a volume here)
RUN mkdir -p /data

ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "packages/web/server.js"]
