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


const DEMO_TRACE_TTL_MS =
  Number(
    process.env.DEMO_TRACE_TTL_MS ||
    10 * 60 * 1000
  );

const DEMO_TRACE_MAX_ITEMS =
  Number(
    process.env.DEMO_TRACE_MAX_ITEMS ||
    200
  );

const DEMO_DELAY_MAX_MS =
  Number(
    process.env.DEMO_DELAY_MAX_MS ||
    2000
  );

const WORKFLOW_STAGE_DEFINITIONS = [
  {
    id: "api-gateway",
    label: "API Gateway",
    order: 0
  },
  {
    id: "iot-simulator",
    label: "IoT Simulator",
    order: 1
  },
  {
    id: "data-collector",
    label: "Data Collector",
    order: 2
  },
  {
    id: "processing-service",
    label: "Processing Service",
    order: 3
  },
  {
    id: "optimization-service",
    label: "Optimization Service",
    order: 4
  }
];

const workflowTraces = new Map();


const calculateDurationMs = (
  startedAtNanoseconds
) => Number(
  process.hrtime.bigint() -
  startedAtNanoseconds
) / 1_000_000;


const roundDuration = (value) =>
  Number(
    Number(value || 0).toFixed(3)
  );


const wait = (durationMs) =>
  new Promise(
    (resolve) =>
      setTimeout(resolve, durationMs)
  );


function parseDemoDelay(request) {
  const requestedDelay =
    Number(
      request.headers[
        "x-demo-delay-ms"
      ] || 0
    );

  if (
    !Number.isFinite(requestedDelay) ||
    requestedDelay <= 0
  ) {
    return 0;
  }

  return Math.min(
    Math.floor(requestedDelay),
    DEMO_DELAY_MAX_MS
  );
}


async function applyDemoDelay(trace) {
  if (trace.demoDelayMs > 0) {
    await wait(trace.demoDelayMs);
  }
}


function cleanupWorkflowTraces() {
  const now = Date.now();

  for (
    const [requestId, trace]
    of workflowTraces.entries()
  ) {
    const referenceTime =
      trace.completedAt ||
      trace.failedAt ||
      trace.startedAt;

    const age =
      now -
      new Date(referenceTime).getTime();

    if (age > DEMO_TRACE_TTL_MS) {
      workflowTraces.delete(requestId);
    }
  }

  if (
    workflowTraces.size <=
    DEMO_TRACE_MAX_ITEMS
  ) {
    return;
  }

  const sortedEntries = [
    ...workflowTraces.entries()
  ].sort(
    (left, right) =>
      new Date(
        left[1].startedAt
      ).getTime() -
      new Date(
        right[1].startedAt
      ).getTime()
  );

  const numberToDelete =
    workflowTraces.size -
    DEMO_TRACE_MAX_ITEMS;

  for (
    const [requestId]
    of sortedEntries.slice(
      0,
      numberToDelete
    )
  ) {
    workflowTraces.delete(requestId);
  }
}


function createWorkflowTrace({
  requestId,
  experimentId,
  demoDelayMs
}) {
  cleanupWorkflowTraces();

  const startedAt =
    new Date().toISOString();

  const trace = {
    requestId,
    experimentId,
    status: "RUNNING",
    startedAt,
    completedAt: null,
    failedAt: null,
    failedStage: null,
    durationMs: null,
    technicalDurationMs: null,
    demoDelayMs,
    stages:
      WORKFLOW_STAGE_DEFINITIONS.map(
        (definition) => ({
          ...definition,
          status: "PENDING",
          startedAt: null,
          completedAt: null,
          durationMs: null,
          input: null,
          output: null,
          error: null
        })
      ),
    finalResult: null
  };

  workflowTraces.set(
    requestId,
    trace
  );

  return trace;
}


function getWorkflowStage(
  trace,
  stageId
) {
  return trace.stages.find(
    (stage) =>
      stage.id === stageId
  );
}


function markStageRunning(
  trace,
  stageId,
  input = null
) {
  const stage =
    getWorkflowStage(
      trace,
      stageId
    );

  if (!stage) {
    return;
  }

  stage.status = "RUNNING";
  stage.startedAt =
    new Date().toISOString();
  stage.input = input;
  stage.output = null;
  stage.error = null;
}


function markStageCompleted(
  trace,
  stageId,
  durationMs,
  output = null
) {
  const stage =
    getWorkflowStage(
      trace,
      stageId
    );

  if (!stage) {
    return;
  }

  stage.status = "COMPLETED";
  stage.completedAt =
    new Date().toISOString();
  stage.durationMs =
    roundDuration(durationMs);
  stage.output = output;
}


function markStageFailed(
  trace,
  stageId,
  durationMs,
  error
) {
  const stage =
    getWorkflowStage(
      trace,
      stageId
    );

  if (!stage) {
    return;
  }

  stage.status = "FAILED";
  stage.completedAt =
    new Date().toISOString();
  stage.durationMs =
    roundDuration(durationMs);
  stage.error = {
    message:
      error?.message ||
      "Erreur inconnue",
    status:
      error?.response?.status ||
      null,
    details:
      error?.response?.data ||
      null
  };
}


function calculateTechnicalDuration(
  trace
) {
  return roundDuration(
    trace.stages
      .filter(
        (stage) =>
          stage.id !==
          "api-gateway"
      )
      .reduce(
        (total, stage) =>
          total +
          Number(
            stage.durationMs || 0
          ),
        0
      )
  );
}

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
  const workflowStartedAt =
    process.hrtime.bigint();

  const requestId =
    req.requestId;

  const experimentId =
    req.experimentId;

  const forwardHeaders =
    buildForwardHeaders(req);

  const demoDelayMs =
    parseDemoDelay(req);

  const trace =
    createWorkflowTrace({
      requestId,
      experimentId,
      demoDelayMs
    });

  let currentStage =
    "api-gateway";

  let currentStageStartedAt =
    process.hrtime.bigint();

  markStageRunning(
    trace,
    "api-gateway",
    {
      method: req.method,
      path: req.path,
      contentType:
        req.get("content-type") ||
        null
    }
  );

  try {
    currentStage =
      "iot-simulator";

    currentStageStartedAt =
      process.hrtime.bigint();

    markStageRunning(
      trace,
      currentStage,
      {
        method: "GET",
        endpoint: "/simulate"
      }
    );

    const simulationResponse =
      await axios.get(
        `${SERVICES.iotSimulator}/simulate`,
        {
          headers: forwardHeaders,
          timeout:
            SERVICE_REQUEST_TIMEOUT_MS
        }
      );

    const simulationDurationMs =
      calculateDurationMs(
        currentStageStartedAt
      );

    const measurement =
      simulationResponse.data?.data;

    if (
      !measurement ||
      typeof measurement !== "object"
    ) {
      throw new Error(
        "Invalid measurement returned by iot-simulator"
      );
    }

    await applyDemoDelay(trace);

    markStageCompleted(
      trace,
      currentStage,
      simulationDurationMs,
      {
        sensorId:
          measurement.sensorId,
        consumption:
          measurement.consumption,
        production:
          measurement.production,
        voltage:
          measurement.voltage,
        frequency:
          measurement.frequency,
        load:
          measurement.load,
        timestamp:
          measurement.timestamp
      }
    );


    currentStage =
      "data-collector";

    currentStageStartedAt =
      process.hrtime.bigint();

    markStageRunning(
      trace,
      currentStage,
      {
        method: "POST",
        endpoint: "/data",
        sensorId:
          measurement.sensorId
      }
    );

    const collectionResponse =
      await axios.post(
        `${SERVICES.dataCollector}/data`,
        measurement,
        {
          headers: forwardHeaders,
          timeout:
            SERVICE_REQUEST_TIMEOUT_MS
        }
      );

    const collectionDurationMs =
      calculateDurationMs(
        currentStageStartedAt
      );

    const collectedMeasurement =
      collectionResponse.data?.data ||
      measurement;

    await applyDemoDelay(trace);

    markStageCompleted(
      trace,
      currentStage,
      collectionDurationMs,
      {
        message:
          collectionResponse.data
            ?.message || null,
        total:
          collectionResponse.data
            ?.total ?? null,
        receivedAt:
          collectedMeasurement
            ?.receivedAt || null
      }
    );


    currentStage =
      "processing-service";

    currentStageStartedAt =
      process.hrtime.bigint();

    markStageRunning(
      trace,
      currentStage,
      {
        method: "POST",
        endpoint: "/process",
        consumption:
          collectedMeasurement
            .consumption,
        production:
          collectedMeasurement
            .production,
        load:
          collectedMeasurement.load
      }
    );

    const processingResponse =
      await axios.post(
        `${SERVICES.processingService}/process`,
        collectedMeasurement,
        {
          headers: forwardHeaders,
          timeout:
            SERVICE_REQUEST_TIMEOUT_MS
        }
      );

    const processingDurationMs =
      calculateDurationMs(
        currentStageStartedAt
      );

    const processedResult =
      processingResponse.data?.result;

    if (
      !processedResult ||
      typeof processedResult !==
      "object"
    ) {
      throw new Error(
        "Invalid result returned by processing-service"
      );
    }

    await applyDemoDelay(trace);

    markStageCompleted(
      trace,
      currentStage,
      processingDurationMs,
      {
        consumption:
          processedResult.consumption,
        production:
          processedResult.production,
        balance:
          processedResult.balance,
        loadStatus:
          processedResult.loadStatus,
        processedAt:
          processedResult.processedAt
      }
    );


    currentStage =
      "optimization-service";

    currentStageStartedAt =
      process.hrtime.bigint();

    markStageRunning(
      trace,
      currentStage,
      {
        method: "POST",
        endpoint: "/optimize",
        balance:
          processedResult.balance
      }
    );

    const optimizationResponse =
      await axios.post(
        `${SERVICES.optimizationService}/optimize`,
        processedResult,
        {
          headers: forwardHeaders,
          timeout:
            SERVICE_REQUEST_TIMEOUT_MS
        }
      );

    const optimizationDurationMs =
      calculateDurationMs(
        currentStageStartedAt
      );

    await applyDemoDelay(trace);

    markStageCompleted(
      trace,
      currentStage,
      optimizationDurationMs,
      {
        decision:
          optimizationResponse.data
            ?.decision || null,
        balance:
          optimizationResponse.data
            ?.balance ?? null,
        optimizedAt:
          optimizationResponse.data
            ?.optimizedAt || null
      }
    );


    const workflowDurationMs =
      calculateDurationMs(
        workflowStartedAt
      );

    const technicalDurationMs =
      calculateTechnicalDuration(
        trace
      );

    const completedAt =
      new Date().toISOString();

    const finalResult = {
      measurement,
      collection:
        collectionResponse.data,
      processing:
        processingResponse.data,
      optimization:
        optimizationResponse.data
    };

    markStageCompleted(
      trace,
      "api-gateway",
      workflowDurationMs,
      {
        status: "SUCCESS",
        decision:
          optimizationResponse.data
            ?.decision || null,
        balance:
          optimizationResponse.data
            ?.balance ?? null
      }
    );

    trace.status =
      "COMPLETED";

    trace.completedAt =
      completedAt;

    trace.durationMs =
      roundDuration(
        workflowDurationMs
      );

    trace.technicalDurationMs =
      technicalDurationMs;

    trace.finalResult =
      finalResult;

    console.log(
      JSON.stringify({
        timestamp: completedAt,
        level: "info",
        event:
          "smartgrid_workflow_completed",
        service: SERVICE_NAME,
        request_id: requestId,
        experiment_id:
          experimentId,
        duration_ms:
          trace.durationMs,
        technical_duration_ms:
          technicalDurationMs,
        demo_delay_ms:
          demoDelayMs,
        decision:
          optimizationResponse.data
            ?.decision || null,
        balance:
          optimizationResponse.data
            ?.balance ?? null
      })
    );

    res.status(200).json({
      service: SERVICE_NAME,
      status: "SUCCESS",
      requestId,
      experimentId,
      durationMs:
        trace.durationMs,
      technicalDurationMs,
      demoDelayMs,
      traceUrl:
        `/smartgrid/traces/${requestId}`,
      measurement,
      collection:
        collectionResponse.data,
      processing:
        processingResponse.data,
      optimization:
        optimizationResponse.data,
      timestamp:
        completedAt
    });
  } catch (error) {
    const failedStageDurationMs =
      calculateDurationMs(
        currentStageStartedAt
      );

    markStageFailed(
      trace,
      currentStage,
      failedStageDurationMs,
      error
    );

    const workflowDurationMs =
      calculateDurationMs(
        workflowStartedAt
      );

    if (
      currentStage !==
      "api-gateway"
    ) {
      markStageFailed(
        trace,
        "api-gateway",
        workflowDurationMs,
        error
      );
    }

    const failedAt =
      new Date().toISOString();

    trace.status =
      "FAILED";

    trace.failedAt =
      failedAt;

    trace.failedStage =
      currentStage;

    trace.durationMs =
      roundDuration(
        workflowDurationMs
      );

    trace.technicalDurationMs =
      calculateTechnicalDuration(
        trace
      );

    const errorEvent = {
      timestamp: failedAt,
      level: "error",
      event:
        "smartgrid_workflow_failed",
      service: SERVICE_NAME,
      request_id: requestId,
      experiment_id:
        experimentId,
      failed_stage:
        currentStage,
      downstream_status:
        error.response?.status ||
        null,
      duration_ms:
        trace.durationMs,
      message:
        error.message
    };

    console.error(
      JSON.stringify(errorEvent)
    );

    res.status(502).json({
      service: SERVICE_NAME,
      status: "FAILED",
      requestId,
      experimentId,
      failedStage:
        currentStage,
      error:
        "Integrated Smart Grid workflow failed",
      details:
        error.response?.data ||
        error.message,
      durationMs:
        trace.durationMs,
      technicalDurationMs:
        trace.technicalDurationMs,
      demoDelayMs,
      traceUrl:
        `/smartgrid/traces/${requestId}`,
      timestamp:
        failedAt
    });
  }
});


app.get(
  "/smartgrid/traces",
  (req, res) => {
    cleanupWorkflowTraces();

    const requestedLimit =
      Number(
        req.query.limit || 50
      );

    const limit =
      Number.isFinite(requestedLimit)
        ? Math.min(
            Math.max(
              Math.floor(
                requestedLimit
              ),
              1
            ),
            200
          )
        : 50;

    const traces = [
      ...workflowTraces.values()
    ]
      .sort(
        (left, right) =>
          new Date(
            right.startedAt
          ).getTime() -
          new Date(
            left.startedAt
          ).getTime()
      )
      .slice(0, limit);

    res.json({
      count: traces.length,
      traces,
      timestamp:
        new Date().toISOString()
    });
  }
);


app.get(
  "/smartgrid/traces/:requestId",
  (req, res) => {
    cleanupWorkflowTraces();

    const trace =
      workflowTraces.get(
        req.params.requestId
      );

    if (!trace) {
      return res.status(404).json({
        error:
          "Workflow trace not found",
        requestId:
          req.params.requestId,
        timestamp:
          new Date().toISOString()
      });
    }

    res.json(trace);
  }
);


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
