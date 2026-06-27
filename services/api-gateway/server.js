const express = require("express");
const cors = require("cors");
const client = require("prom-client");

const app = express();

// SMARTGRID_STRUCTURED_ANOMALY_LOGGING_V1
const classifyHttpAnomaly = (statusCode) => {
  if (statusCode === 400) return "invalid_request";
  if (statusCode === 401) return "authentication_error";
  if (statusCode === 403) return "authorization_error";
  if (statusCode === 404) return "not_found";
  if (statusCode >= 500) return "server_error";
  return "client_error";
};

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();

  const requestId = String(
    req.headers["x-request-id"] ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const experimentId = req.headers["x-experiment-id"]
    ? String(req.headers["x-experiment-id"])
    : null;

  const anomalyId = req.headers["x-anomaly-id"]
    ? String(req.headers["x-anomaly-id"])
    : null;

  req.requestId = requestId;
  req.experimentId = experimentId;
  req.anomalyId = anomalyId;

  res.setHeader("x-request-id", requestId);

  res.once("finish", () => {
    const statusCode = res.statusCode;

    if (statusCode < 400) {
      return;
    }

    const durationMs =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    const event = {
      timestamp: new Date().toISOString(),
      level: statusCode >= 500 ? "error" : "warn",
      event: "http_anomaly",
      anomaly: true,
      anomaly_type: classifyHttpAnomaly(statusCode),
      service: SERVICE_NAME,
      request_id: requestId,
      experiment_id: experimentId,
      anomaly_id: anomalyId,
      method: req.method,
      path: String(
        req.originalUrl ||
        req.url ||
        req.path ||
        ""
      ).split("?")[0],
      status: statusCode,
      duration_ms: Number(durationMs.toFixed(3))
    };

    const serializedEvent = JSON.stringify(event);

    if (statusCode >= 500) {
      console.error(serializedEvent);
    } else {
      console.warn(serializedEvent);
    }
  });

  next();
});
// SMARTGRID_STRUCTURED_ANOMALY_LOGGING_V1_END

const PORT = process.env.PORT || 3000;
const SERVICE_NAME = "api-gateway";

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
    description: "Point d'entrée principal de la plateforme",
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

const axios = require("axios");

const SERVICES = {
  iotSimulator: process.env.IOT_SIMULATOR_URL || "http://iot-simulator:3001",
  dataCollector: process.env.DATA_COLLECTOR_URL || "http://data-collector:3002",
  processingService: process.env.PROCESSING_SERVICE_URL || "http://processing-service:3003",
  optimizationService: process.env.OPTIMIZATION_SERVICE_URL || "http://optimization-service:3004"
};

const SERVICE_REQUEST_TIMEOUT_MS =
  Number(process.env.SERVICE_REQUEST_TIMEOUT_MS || 5000);

const buildForwardHeaders = (req) => {
  const headers = {
    "x-request-id": req.requestId
  };

  if (req.experimentId) {
    headers["x-experiment-id"] = req.experimentId;
  }

  if (req.anomalyId) {
    headers["x-anomaly-id"] = req.anomalyId;
  }

  return headers;
};

app.get("/platform/health", async (req, res) => {
  const results = {};

  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const response = await axios.get(`${url}/health`, { timeout: 3000 });
      results[name] = {
        status: "UP",
        data: response.data
      };
    } catch (error) {
      results[name] = {
        status: "DOWN",
        error: error.message
      };
    }
  }

  res.json({
    service: SERVICE_NAME,
    platformStatus: Object.values(results).every(item => item.status === "UP") ? "UP" : "DEGRADED",
    services: results,
    timestamp: new Date().toISOString()
  });
});

app.post("/smartgrid/simulate", async (req, res) => {
  const startedAt = process.hrtime.bigint();

  const requestId = req.requestId;
  const experimentId = req.experimentId;
  const forwardHeaders = buildForwardHeaders(req);

  let currentStage = "simulation";

  try {
    const simulationResponse = await axios.get(
      `${SERVICES.iotSimulator}/simulate`,
      {
        headers: forwardHeaders,
        timeout: SERVICE_REQUEST_TIMEOUT_MS
      }
    );

    const measurement = simulationResponse.data?.data;

    if (!measurement || typeof measurement !== "object") {
      throw new Error(
        "Invalid measurement returned by iot-simulator"
      );
    }

    currentStage = "collection";

    const collectionResponse = await axios.post(
      `${SERVICES.dataCollector}/data`,
      measurement,
      {
        headers: forwardHeaders,
        timeout: SERVICE_REQUEST_TIMEOUT_MS
      }
    );

    const collectedMeasurement =
      collectionResponse.data?.data || measurement;

    currentStage = "processing";

    const processingResponse = await axios.post(
      `${SERVICES.processingService}/process`,
      collectedMeasurement,
      {
        headers: forwardHeaders,
        timeout: SERVICE_REQUEST_TIMEOUT_MS
      }
    );

    const processedResult =
      processingResponse.data?.result;

    if (!processedResult || typeof processedResult !== "object") {
      throw new Error(
        "Invalid result returned by processing-service"
      );
    }

    currentStage = "optimization";

    const optimizationResponse = await axios.post(
      `${SERVICES.optimizationService}/optimize`,
      processedResult,
      {
        headers: forwardHeaders,
        timeout: SERVICE_REQUEST_TIMEOUT_MS
      }
    );

    const durationMs =
      Number(process.hrtime.bigint() - startedAt) /
      1_000_000;

    const completedAt = new Date().toISOString();

    console.log(
      JSON.stringify({
        timestamp: completedAt,
        level: "info",
        event: "smartgrid_workflow_completed",
        service: SERVICE_NAME,
        request_id: requestId,
        experiment_id: experimentId,
        duration_ms: Number(durationMs.toFixed(3)),
        decision:
          optimizationResponse.data?.decision || null,
        balance:
          optimizationResponse.data?.balance ?? null
      })
    );

    res.status(200).json({
      service: SERVICE_NAME,
      status: "SUCCESS",
      requestId,
      experimentId,
      durationMs: Number(durationMs.toFixed(3)),
      measurement,
      collection: collectionResponse.data,
      processing: processingResponse.data,
      optimization: optimizationResponse.data,
      timestamp: completedAt
    });
  } catch (error) {
    const durationMs =
      Number(process.hrtime.bigint() - startedAt) /
      1_000_000;

    const failedAt = new Date().toISOString();

    const errorEvent = {
      timestamp: failedAt,
      level: "error",
      event: "smartgrid_workflow_failed",
      service: SERVICE_NAME,
      request_id: requestId,
      experiment_id: experimentId,
      failed_stage: currentStage,
      downstream_status:
        error.response?.status || null,
      duration_ms: Number(durationMs.toFixed(3)),
      message: error.message
    };

    console.error(
      JSON.stringify(errorEvent)
    );

    res.status(502).json({
      service: SERVICE_NAME,
      status: "FAILED",
      requestId,
      experimentId,
      failedStage: currentStage,
      error: "Integrated Smart Grid workflow failed",
      details:
        error.response?.data || error.message,
      durationMs: Number(durationMs.toFixed(3)),
      timestamp: failedAt
    });
  }
});

app.get("/iot/simulate", async (req, res) => {
  try {
    const response = await axios.get(`${SERVICES.iotSimulator}/simulate`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      service: SERVICE_NAME,
      error: "Unable to reach iot-simulator",
      details: error.message
    });
  }
});

app.post("/collector/data", async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.dataCollector}/data`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(500).json({
      service: SERVICE_NAME,
      error: "Unable to reach data-collector",
      details: error.message
    });
  }
});

app.post("/processing/process", async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.processingService}/process`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(500).json({
      service: SERVICE_NAME,
      error: "Unable to reach processing-service",
      details: error.message
    });
  }
});

app.post("/optimization/optimize", async (req, res) => {
  try {
    const response = await axios.post(`${SERVICES.optimizationService}/optimize`, req.body);
    res.status(response.status).json(response.data);
  } catch (error) {
    res.status(500).json({
      service: SERVICE_NAME,
      error: "Unable to reach optimization-service",
      details: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${SERVICE_NAME} running on port ${PORT}`);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "service_started",
    service: SERVICE_NAME,
    port: Number(PORT)
  }));
});
