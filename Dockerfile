FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data
WORKDIR /app
RUN mkdir -p /data/photos && chown -R node:node /data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src/server.mjs ./src/server.mjs
COPY --from=build --chown=node:node /app/candidates.json ./candidates.json
USER node
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "src/server.mjs"]
