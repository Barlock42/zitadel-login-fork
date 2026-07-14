# Self-contained multi-stage build of the ZITADEL Login UI.
# Builds the monorepo standalone output natively on Linux so pnpm symlinks
# resolve correctly inside the container (a Windows host build produces broken
# absolute symlinks). Context = repo root.
FROM node:24 AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# NEXT_PUBLIC_* is inlined at build time; base path must be set here.
ENV NEXT_PUBLIC_BASE_PATH=/ui/v2/login
RUN pnpm nx run @zitadel/login:build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
RUN mkdir -p /.env-file && touch /.env-file/.env && chown -R nextjs:nodejs /.env-file

COPY --from=builder --chown=nextjs:nodejs /repo/apps/login/.next/standalone ./

USER nextjs
ENV HOSTNAME="::" \
    PORT="3000" \
    NODE_ENV="production" \
    NODE_OPTIONS="--use-openssl-ca --require /app/load-ssl-cert-dir.cjs" \
    SSL_CERT_FILE="/etc/ssl/certs/ca-certificates.crt" \
    ZITADEL_TLS_ENABLED="false" \
    OTEL_SERVICE_NAME="zitadel-login" \
    OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD ["/usr/local/bin/node", "/app/healthcheck.mjs", "/ui/v2/login/ready"]
ENTRYPOINT ["/app/entrypoint.sh", "node", "apps/login/server.js"]
