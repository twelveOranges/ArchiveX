FROM node:20-alpine

WORKDIR /app

# Install tar for backup/restore
RUN apk add --no-cache tar

COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY public/ ./public/

# Default data directory (mount a volume here)
RUN mkdir -p /data

ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
