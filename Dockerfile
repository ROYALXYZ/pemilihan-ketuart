FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
WORKDIR /app
RUN apk add --no-cache su-exec && mkdir -p /data/photos
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/server.mjs ./src/server.mjs
COPY --from=build --chown=node:node /app/candidates.json ./candidates.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Lindungi dari checkout CRLF (Windows): shebang ber-CR membuat container gagal start.
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8787
VOLUME ["/data"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/server.mjs"]
