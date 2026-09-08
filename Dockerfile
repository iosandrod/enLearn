# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/package.json
COPY frontend/package.json frontend/package.json
COPY mobile-app/package.json mobile-app/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile

FROM dependencies AS frontend-build
COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_SOCKET_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SOCKET_BASE_URL=$VITE_SOCKET_BASE_URL
RUN pnpm --dir frontend build

FROM dependencies AS api-build
COPY . .
RUN pnpm --dir api build && pnpm prune --prod

FROM dependencies AS planning-build
COPY . .
RUN pnpm --dir api exec tsc -p ../cpp-typescript/tsconfig.json

FROM base AS api-runtime
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3002
WORKDIR /app
COPY --from=api-build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=api-build /app/pnpm-lock.yaml ./
COPY --from=api-build /app/api/package.json ./api/package.json
COPY --from=api-build /app/api/dist ./api/dist
COPY --from=api-build /app/api/node_modules ./api/node_modules
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/packages ./packages
COPY --from=planning-build /app/cpp-typescript ./cpp-typescript
WORKDIR /app/api
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/api/service').then(() => process.exit(0)).catch(() => process.exit(1))"
CMD ["node", "dist/standalone.js"]

FROM caddy:2-alpine AS web-runtime
COPY --from=frontend-build /app/frontend/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
