FROM node:20-bookworm-slim AS build

ENV NODE_ENV=development

WORKDIR /app

COPY dashboard/dashboard-frontend/package.json ./
COPY dashboard/dashboard-frontend/package-lock.json ./

RUN npm ci

COPY dashboard/dashboard-frontend/index.html ./
COPY dashboard/dashboard-frontend/src ./src

RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY dashboard/dashboard-frontend/nginx.conf \
  /etc/nginx/conf.d/default.conf

COPY --from=build \
  /app/dist \
  /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=10s \
  --retries=3 \
  CMD wget -q -O - \
    http://127.0.0.1:8080/healthz \
    || exit 1
