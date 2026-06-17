FROM node:20-alpine

WORKDIR /app

COPY dashboard/dashboard-api/package*.json ./
RUN npm install --omit=dev

COPY dashboard/dashboard-api/server.js ./
COPY reports ./reports

EXPOSE 4000

CMD ["npm", "start"]
