# syntax=docker/dockerfile:1

# ---- build: install, test-ready workspace, bundle backend, build frontend
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime: one bundled server file, the static UI, and the native SQLite driver
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 DB_FILE=/data/app.db STATIC_DIR=/app/public
WORKDIR /app

# better-sqlite3 is a native module, so esbuild leaves it out of the bundle.
# prebuild-install is only used at install time and is not copied.
COPY --from=build /app/node_modules/better-sqlite3 node_modules/better-sqlite3
COPY --from=build /app/node_modules/bindings node_modules/bindings
COPY --from=build /app/node_modules/file-uri-to-path node_modules/file-uri-to-path
COPY --from=build /app/backend/dist dist
COPY --from=build /app/frontend/dist public

RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/server.cjs"]
