# Build the client
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime: dependencies only (the server). Node 24 runs the server's
# TypeScript directly, no build step.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY db.sql ./
COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist

ENV NODE_ENV=production
EXPOSE 3000
# Up and the database answers (GET /api/health). A worker-only container
# (ROLE=worker) serves no HTTP: it counts as healthy while it runs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD test "$ROLE" = worker || wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
USER node
CMD ["node", "server/index.ts"]
