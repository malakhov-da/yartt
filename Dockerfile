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
USER node
CMD ["node", "server/index.ts"]
