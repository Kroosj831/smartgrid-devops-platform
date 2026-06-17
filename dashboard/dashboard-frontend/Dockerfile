FROM node:20-alpine AS build

WORKDIR /app

COPY dashboard/dashboard-frontend/package*.json ./
RUN npm install

COPY dashboard/dashboard-frontend/index.html ./
COPY dashboard/dashboard-frontend/src ./src

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
