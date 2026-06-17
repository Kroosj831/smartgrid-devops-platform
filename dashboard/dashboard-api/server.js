import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as k8s from "@kubernetes/client-node";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const NAMESPACE = process.env.SMARTGRID_NAMESPACE || "smartgrid-dev";
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, "reports");
const DB_PATH = process.env.DB_PATH || "/data/dashboard.sqlite";

const SERVICES = [
  { name: "api-gateway", url: "http://api-gateway:3000/health" },
  { name: "iot-simulator", url: "http://iot-simulator:3001/health" },
  { name: "data-collector", url: "http://data-collector:3002/health" },
  { name: "processing-service", url: "http://processing-service:3003/health" },
  { name: "optimization-service", url: "http://optimization-service:3004/health" }
];

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDataDir();

const db = await open({
  filename: DB_PATH,
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS experiment_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT UNIQUE,
    scenario TEXT,
    metric_name TEXT,
    value REAL,
    unit TEXT,
    threshold REAL,
    status TEXT,
    timestamp TEXT,
    raw_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kubernetes_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT,
    name TEXT,
    namespace TEXT,
    status TEXT,
    replicas INTEGER,
    ready_replicas INTEGER,
    restarts INTEGER,
    raw_json TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dashboard_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT,
    target TEXT,
    status TEXT,
    started_at TEXT,
    finished_at TEXT,
    duration_seconds REAL,
    result TEXT
  );
`);

const kc = new k8s.KubeConfig();

try {
  kc.loadFromCluster();
} catch {
  kc.loadFromDefault();
}

const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const autoscalingApi = kc.makeApiClient(k8s.AutoscalingV2Api);

async function callK8s(newCall, oldCall) {
  try {
    const response = await newCall();
    return response.body || response;
  } catch {
    const response = await oldCall();
    return response.body || response;
  }
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      error: true,
      message: error.message,
      file: filePath
    };
  }
}

function readAllJsonReports() {
  const jsonDir = path.join(REPORTS_DIR, "json");

  if (!fs.existsSync(jsonDir)) return [];

  return fs.readdirSync(jsonDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({
      file,
      data: readJsonFile(path.join(jsonDir, file))
    }));
}

function summarizeExperiments(reports) {
  const summary = {
    total: reports.length,
    validated: 0,
    rejected: 0,
    measured: 0
  };

  for (const report of reports) {
    const status = report.data?.status;

    if (status === "validated") summary.validated += 1;
    else if (status === "rejected") summary.rejected += 1;
    else summary.measured += 1;
  }

  return summary;
}

function normalizeReport(file, data) {
  let metricName = data?.metricName || data?.metric || null;
  let value = data?.value ?? null;
  let unit = data?.unit || null;
  let threshold = data?.threshold ?? null;

  if (!metricName && data?.p95LatencyMs !== undefined) {
    metricName = "p95_latency";
    value = data.p95LatencyMs;
    unit = "milliseconds";
    threshold = data.p95LatencyThresholdMs ?? null;
  }

  if (!metricName && data?.totalRequests !== undefined) {
    metricName = "total_requests";
    value = data.totalRequests;
    unit = "requests";
  }

  return {
    source_file: file,
    scenario: data?.scenario || "unknown",
    metric_name: metricName,
    value,
    unit,
    threshold,
    status: data?.status || "measured",
    timestamp: data?.timestamp || new Date().toISOString(),
    raw_json: JSON.stringify(data)
  };
}

async function saveExperimentResult(report) {
  await db.run(
    `
    INSERT INTO experiment_results (
      source_file,
      scenario,
      metric_name,
      value,
      unit,
      threshold,
      status,
      timestamp,
      raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_file) DO UPDATE SET
      scenario = excluded.scenario,
      metric_name = excluded.metric_name,
      value = excluded.value,
      unit = excluded.unit,
      threshold = excluded.threshold,
      status = excluded.status,
      timestamp = excluded.timestamp,
      raw_json = excluded.raw_json
    `,
    [
      report.source_file,
      report.scenario,
      report.metric_name,
      report.value,
      report.unit,
      report.threshold,
      report.status,
      report.timestamp,
      report.raw_json
    ]
  );
}

async function importReportsIntoHistory() {
  const reports = readAllJsonReports();

  for (const report of reports) {
    if (report.data && !report.data.error) {
      await saveExperimentResult(normalizeReport(report.file, report.data));
    }
  }

  return reports.length;
}

async function checkServices() {
  const results = [];

  for (const service of SERVICES) {
    try {
      const response = await fetch(service.url);
      const data = await response.json();

      results.push({
        name: service.name,
        status: response.ok ? "UP" : "DOWN",
        httpStatus: response.status,
        data
      });
    } catch (error) {
      results.push({
        name: service.name,
        status: "DOWN",
        error: error.message
      });
    }
  }

  return results;
}

async function listPods() {
  const data = await callK8s(
    () => coreApi.listNamespacedPod({ namespace: NAMESPACE }),
    () => coreApi.listNamespacedPod(NAMESPACE)
  );

  return data.items.map((pod) => ({
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    phase: pod.status.phase,
    podIP: pod.status.podIP,
    nodeName: pod.spec.nodeName,
    containers: (pod.status.containerStatuses || []).map((container) => ({
      name: container.name,
      ready: container.ready,
      restartCount: container.restartCount,
      image: container.image
    }))
  }));
}

async function listDeployments() {
  const data = await callK8s(
    () => appsApi.listNamespacedDeployment({ namespace: NAMESPACE }),
    () => appsApi.listNamespacedDeployment(NAMESPACE)
  );

  return data.items.map((deployment) => ({
    name: deployment.metadata.name,
    namespace: deployment.metadata.namespace,
    replicas: deployment.spec.replicas || 0,
    readyReplicas: deployment.status.readyReplicas || 0,
    availableReplicas: deployment.status.availableReplicas || 0,
    updatedReplicas: deployment.status.updatedReplicas || 0
  }));
}

async function listHpas() {
  const data = await callK8s(
    () => autoscalingApi.listNamespacedHorizontalPodAutoscaler({ namespace: NAMESPACE }),
    () => autoscalingApi.listNamespacedHorizontalPodAutoscaler(NAMESPACE)
  );

  return data.items.map((hpa) => ({
    name: hpa.metadata.name,
    namespace: hpa.metadata.namespace,
    minReplicas: hpa.spec.minReplicas,
    maxReplicas: hpa.spec.maxReplicas,
    currentReplicas: hpa.status.currentReplicas || 0,
    desiredReplicas: hpa.status.desiredReplicas || 0,
    currentMetrics: hpa.status.currentMetrics || []
  }));
}

async function saveKubernetesSnapshot() {
  const timestamp = new Date().toISOString();

  const pods = await listPods();
  const deployments = await listDeployments();
  const hpas = await listHpas();

  for (const pod of pods) {
    const restarts = pod.containers.reduce((sum, c) => sum + c.restartCount, 0);

    await db.run(
      `
      INSERT INTO kubernetes_snapshots (
        resource_type, name, namespace, status, replicas,
        ready_replicas, restarts, raw_json, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "pod",
        pod.name,
        pod.namespace,
        pod.phase,
        null,
        null,
        restarts,
        JSON.stringify(pod),
        timestamp
      ]
    );
  }

  for (const deployment of deployments) {
    await db.run(
      `
      INSERT INTO kubernetes_snapshots (
        resource_type, name, namespace, status, replicas,
        ready_replicas, restarts, raw_json, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "deployment",
        deployment.name,
        deployment.namespace,
        deployment.readyReplicas === deployment.replicas ? "Ready" : "NotReady",
        deployment.replicas,
        deployment.readyReplicas,
        null,
        JSON.stringify(deployment),
        timestamp
      ]
    );
  }

  for (const hpa of hpas) {
    await db.run(
      `
      INSERT INTO kubernetes_snapshots (
        resource_type, name, namespace, status, replicas,
        ready_replicas, restarts, raw_json, timestamp
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "hpa",
        hpa.name,
        hpa.namespace,
        "Observed",
        hpa.desiredReplicas,
        hpa.currentReplicas,
        null,
        JSON.stringify(hpa),
        timestamp
      ]
    );
  }

  return {
    timestamp,
    pods: pods.length,
    deployments: deployments.length,
    hpas: hpas.length
  };
}

await importReportsIntoHistory();

app.get("/dashboard/health", (req, res) => {
  res.json({
    service: "dashboard-api",
    status: "UP",
    database: DB_PATH,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/overview", async (req, res) => {
  const services = await checkServices();
  const reports = readAllJsonReports();
  const historyCount = await db.get("SELECT COUNT(*) as count FROM experiment_results");

  res.json({
    platform: "Smart Grid DevOps Platform",
    namespace: NAMESPACE,
    timestamp: new Date().toISOString(),
    services,
    experiments: summarizeExperiments(reports),
    history: {
      experimentResults: historyCount.count
    }
  });
});

app.get("/api/kubernetes/pods", async (req, res) => {
  try {
    const pods = await listPods();

    res.json({
      namespace: NAMESPACE,
      count: pods.length,
      pods,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to list Kubernetes pods",
      details: error.message
    });
  }
});

app.get("/api/kubernetes/deployments", async (req, res) => {
  try {
    const deployments = await listDeployments();

    res.json({
      namespace: NAMESPACE,
      count: deployments.length,
      deployments,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to list Kubernetes deployments",
      details: error.message
    });
  }
});

app.get("/api/kubernetes/hpa", async (req, res) => {
  try {
    const hpas = await listHpas();

    res.json({
      namespace: NAMESPACE,
      count: hpas.length,
      hpas,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: "Unable to list Kubernetes HPA",
      details: error.message
    });
  }
});

app.get("/api/experiments", (req, res) => {
  const reports = readAllJsonReports();

  res.json({
    count: reports.length,
    summary: summarizeExperiments(reports),
    reports,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/experiments/export/json", (req, res) => {
  const reports = readAllJsonReports();

  res.json({
    reports,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/experiments/export/csv", (req, res) => {
  const csvPath = path.join(REPORTS_DIR, "csv", "experimental-results.csv");

  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: "CSV export not found" });
  }

  res.setHeader("Content-Type", "text/csv");
  res.send(fs.readFileSync(csvPath, "utf8"));
});

app.get("/api/experiments/export/markdown", (req, res) => {
  const markdownDir = path.join(REPORTS_DIR, "markdown");

  if (!fs.existsSync(markdownDir)) {
    return res.status(404).json({ error: "Markdown reports directory not found" });
  }

  const files = fs.readdirSync(markdownDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      file,
      content: fs.readFileSync(path.join(markdownDir, file), "utf8")
    }));

  res.json({
    count: files.length,
    files,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/history/experiments", async (req, res) => {
  const rows = await db.all(`
    SELECT *
    FROM experiment_results
    ORDER BY timestamp DESC, id DESC
  `);

  res.json({
    count: rows.length,
    results: rows,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/history/import-reports", async (req, res) => {
  const startedAt = new Date();
  const imported = await importReportsIntoHistory();
  const finishedAt = new Date();

  await db.run(
    `
    INSERT INTO dashboard_actions (
      action_type, target, status, started_at,
      finished_at, duration_seconds, result
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      "import_reports",
      "reports/json",
      "completed",
      startedAt.toISOString(),
      finishedAt.toISOString(),
      (finishedAt - startedAt) / 1000,
      JSON.stringify({ imported })
    ]
  );

  res.json({
    status: "completed",
    imported,
    timestamp: finishedAt.toISOString()
  });
});

app.post("/api/history/snapshots/kubernetes", async (req, res) => {
  const startedAt = new Date();

  try {
    const result = await saveKubernetesSnapshot();
    const finishedAt = new Date();

    await db.run(
      `
      INSERT INTO dashboard_actions (
        action_type, target, status, started_at,
        finished_at, duration_seconds, result
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "save_kubernetes_snapshot",
        NAMESPACE,
        "completed",
        startedAt.toISOString(),
        finishedAt.toISOString(),
        (finishedAt - startedAt) / 1000,
        JSON.stringify(result)
      ]
    );

    res.json({
      status: "completed",
      result,
      timestamp: finishedAt.toISOString()
    });
  } catch (error) {
    const finishedAt = new Date();

    await db.run(
      `
      INSERT INTO dashboard_actions (
        action_type, target, status, started_at,
        finished_at, duration_seconds, result
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        "save_kubernetes_snapshot",
        NAMESPACE,
        "failed",
        startedAt.toISOString(),
        finishedAt.toISOString(),
        (finishedAt - startedAt) / 1000,
        JSON.stringify({ error: error.message })
      ]
    );

    res.status(500).json({
      status: "failed",
      error: error.message
    });
  }
});

app.get("/api/history/snapshots/kubernetes", async (req, res) => {
  const limit = Number(req.query.limit || 100);

  const rows = await db.all(
    `
    SELECT *
    FROM kubernetes_snapshots
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
    `,
    [limit]
  );

  res.json({
    count: rows.length,
    snapshots: rows,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/history/actions", async (req, res) => {
  const rows = await db.all(`
    SELECT *
    FROM dashboard_actions
    ORDER BY id DESC
    LIMIT 100
  `);

  res.json({
    count: rows.length,
    actions: rows,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`dashboard-api running on port ${PORT}`);
  console.log(`SQLite database: ${DB_PATH}`);
});
