FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Final image starts from Alpine so npm/yarn/corepack never ship.
FROM alpine:3.24 AS runtime
RUN apk upgrade --no-cache \
  && apk add --no-cache libstdc++ ca-certificates wget \
  && addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/ready >/dev/null || exit 1
CMD ["sh", "-c", "node src/migrate.js && exec node src/index.js"]
