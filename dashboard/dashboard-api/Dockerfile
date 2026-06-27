FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PORT=4000
ENV REPORTS_DIR=/reports

WORKDIR /app

COPY dashboard/dashboard-api/package.json ./
COPY dashboard/dashboard-api/package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY dashboard/dashboard-api/server.js ./
COPY dashboard/dashboard-api/report-store.mjs ./
COPY dashboard/dashboard-api/dashboard-compat.mjs ./

USER node

EXPOSE 4000

CMD ["npm", "start"]
