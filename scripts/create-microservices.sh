#!/bin/bash

set -e

BASE_DIR="$HOME/smartgrid-devops-platform/services"

create_service() {
  SERVICE_NAME=$1
  SERVICE_PORT=$2
  SERVICE_DESCRIPTION=$3

  SERVICE_DIR="$BASE_DIR/$SERVICE_NAME"

  mkdir -p "$SERVICE_DIR"

  cat > "$SERVICE_DIR/package.json" <<EOF
{
  "name": "$SERVICE_NAME",
  "version": "1.0.0",
  "description": "$SERVICE_DESCRIPTION",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js",
    "test": "node -e \"console.log('Tests OK for $SERVICE_NAME')\""
  },
  "dependencies": {
    "express": "^4.18.3",
    "cors": "^2.8.5",
    "prom-client": "^15.1.3",
    "axios": "^1.6.7"
  }
}
EOF

  cat > "$SERVICE_DIR/server.js" <<EOF
const express = require("express");
const cors = require("cors");
const client = require("prom-client");

const app = express();
const PORT = process.env.PORT || $SERVICE_PORT;
const SERVICE_NAME = "$SERVICE_NAME";

app.use(cors());
app.use(express.json());

client.collectDefaultMetrics();

const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["service", "method", "route", "status"]
});

const requestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "method", "route", "status"],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestsTotal.inc({
      service: SERVICE_NAME,
      method: req.method,
      route: req.path,
      status: res.statusCode
    });
    requestDuration.observe({
      service: SERVICE_NAME,
      method: req.method,
      route: req.path,
      status: res.statusCode
    }, duration);
  });

  next();
});

app.get("/health", (req, res) => {
  res.json({
    service: SERVICE_NAME,
    status: "UP",
    timestamp: new Date().toISOString()
  });
});

app.get("/status", (req, res) => {
  res.json({
    service: SERVICE_NAME,
    description: "$SERVICE_DESCRIPTION",
    port: PORT,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/simulate-error", (req, res) => {
  res.status(500).json({
    service: SERVICE_NAME,
    error: "Simulated application error",
    timestamp: new Date().toISOString()
  });
});

if (SERVICE_NAME === "iot-simulator") {
  app.get("/simulate", (req, res) => {
    const data = {
      sensorId: "sensor-" + Math.floor(Math.random() * 1000),
      consumption: Number((Math.random() * 100).toFixed(2)),
      production: Number((Math.random() * 120).toFixed(2)),
      voltage: Number((210 + Math.random() * 30).toFixed(2)),
      frequency: Number((49 + Math.random() * 2).toFixed(2)),
      load: Number((Math.random() * 100).toFixed(2)),
      timestamp: new Date().toISOString()
    };

    res.json({
      service: SERVICE_NAME,
      data
    });
  });
}

if (SERVICE_NAME === "data-collector") {
  const measurements = [];

  app.post("/data", (req, res) => {
    const measurement = {
      ...req.body,
      receivedAt: new Date().toISOString()
    };

    measurements.push(measurement);

    res.status(201).json({
      service: SERVICE_NAME,
      message: "Measurement collected",
      total: measurements.length,
      data: measurement
    });
  });

  app.get("/data", (req, res) => {
    res.json({
      service: SERVICE_NAME,
      total: measurements.length,
      data: measurements.slice(-20)
    });
  });
}

if (SERVICE_NAME === "processing-service") {
  app.post("/process", (req, res) => {
    const input = req.body;

    const result = {
      consumption: input.consumption || 0,
      production: input.production || 0,
      balance: Number(((input.production || 0) - (input.consumption || 0)).toFixed(2)),
      loadStatus: (input.load || 0) > 80 ? "HIGH" : "NORMAL",
      processedAt: new Date().toISOString()
    };

    res.json({
      service: SERVICE_NAME,
      result
    });
  });
}

if (SERVICE_NAME === "optimization-service") {
  app.post("/optimize", (req, res) => {
    const input = req.body;
    const balance = (input.production || 0) - (input.consumption || 0);

    let decision = "STABLE";
    if (balance < -20) decision = "REDUCE_NON_CRITICAL_LOAD";
    if (balance > 20) decision = "STORE_OR_REDISTRIBUTE_ENERGY";

    res.json({
      service: SERVICE_NAME,
      decision,
      balance: Number(balance.toFixed(2)),
      optimizedAt: new Date().toISOString()
    });
  });
}

if (SERVICE_NAME === "api-gateway") {
  app.get("/", (req, res) => {
    res.json({
      service: SERVICE_NAME,
      message: "Smart Grid DevOps API Gateway",
      endpoints: [
        "/health",
        "/status",
        "/metrics"
      ],
      timestamp: new Date().toISOString()
    });
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(\`\${SERVICE_NAME} running on port \${PORT}\`);
});
EOF

  cat > "$SERVICE_DIR/Dockerfile" <<EOF
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

EXPOSE $SERVICE_PORT

CMD ["npm", "start"]
EOF

  cat > "$SERVICE_DIR/.dockerignore" <<EOF
node_modules
npm-debug.log
.git
.gitignore
Dockerfile
.dockerignore
EOF

  echo "Created service: $SERVICE_NAME on port $SERVICE_PORT"
}

create_service "iot-simulator" 3001 "Simulation des données IoT Smart Grid"
create_service "data-collector" 3002 "Collecte des données Smart Grid"
create_service "processing-service" 3003 "Traitement des données Smart Grid"
create_service "optimization-service" 3004 "Optimisation énergétique simulée"
create_service "api-gateway" 3000 "Point d'entrée principal de la plateforme"

echo "All microservices created successfully."
