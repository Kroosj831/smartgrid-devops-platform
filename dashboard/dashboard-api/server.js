const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const k8s = require("@kubernetes/client-node");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const NAMESPACE = process.env.SMARTGRID_NAMESPACE || "smartgrid-dev";
const REPORTS_DIR = process.env.REPORTS_DIR || path.join(__dirname, "reports");

const SERVICES = [
  { name: "api-gateway", url: "http://api-gateway:3000/health" },
  { name: "iot-simulator", url: "http://iot-simulator:3001/health" },
  { name: "data-collector", url: "http://data-collector:3002/health" },
  { name: "processing-service", url: "http://processing-service:3003/health" },
  { name: "optimization-service", url: "http://optimization-service:3004/health" }
];

const kc = new k8s.KubeConfig();

try {
  kc.loadFromCluster();
} catch (error) {
  kc.loadFromDefault();
}

const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const appsApi = kc.makeApiClient(k8s.AppsV1Api);
const autoscalingApi = kc.makeApiClient(k8s.AutoscalingV2Api);

async function callK8s(methodWithObjectParam, methodWithOldParam) {
  try {
    const response = await methodWithObjectParam();
    return response.body || response;
  } catch (firstError) {
    const response = await methodWithOldParam();
    return response.body || response;
  }
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
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

  if (!fs.existsSync(jsonDir)) {
    return [];
  }

  return fs.readdirSync(jsonDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const fullPath = path.join(jsonDir, file);
      return {
        file,
        data: readJsonFile(fullPath)
      };
    });
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

    if (status === "validated") {
      summary.validated += 1;
    } else if (status === "rejected") {
      summary.rejected += 1;
    } else {
      summary.measured += 1;
    }
  }

  return summary;
}

async function checkServices() {
  const results = [];

  for (const service of SERVICES) {
    try {
      const response = await fetch(service.url, { timeout: 3000 });
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

app.get("/dashboard/health", (req, res) => {
  res.json({
    service: "dashboard-api",
    status: "UP",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/overview", async (req, res) => {
  const services = await checkServices();
  const reports = readAllJsonReports();

  res.json({
    platform: "Smart Grid DevOps Platform",
    namespace: NAMESPACE,
    timestamp: new Date().toISOString(),
    services,
    experiments: summarizeExperiments(reports)
  });
});

app.get("/api/services/health", async (req, res) => {
  const services = await checkServices();

  res.json({
    namespace: NAMESPACE,
    services,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/kubernetes/pods", async (req, res) => {
  try {
    const data = await callK8s(
      () => coreApi.listNamespacedPod({ namespace: NAMESPACE }),
      () => coreApi.listNamespacedPod(NAMESPACE)
    );

    const pods = data.items.map((pod) => ({
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
    const data = await callK8s(
      () => appsApi.listNamespacedDeployment({ namespace: NAMESPACE }),
      () => appsApi.listNamespacedDeployment(NAMESPACE)
    );

    const deployments = data.items.map((deployment) => ({
      name: deployment.metadata.name,
      namespace: deployment.metadata.namespace,
      replicas: deployment.spec.replicas || 0,
      readyReplicas: deployment.status.readyReplicas || 0,
      availableReplicas: deployment.status.availableReplicas || 0,
      updatedReplicas: deployment.status.updatedReplicas || 0
    }));

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
    const data = await callK8s(
      () => autoscalingApi.listNamespacedHorizontalPodAutoscaler({ namespace: NAMESPACE }),
      () => autoscalingApi.listNamespacedHorizontalPodAutoscaler(NAMESPACE)
    );

    const hpas = data.items.map((hpa) => ({
      name: hpa.metadata.name,
      namespace: hpa.metadata.namespace,
      minReplicas: hpa.spec.minReplicas,
      maxReplicas: hpa.spec.maxReplicas,
      currentReplicas: hpa.status.currentReplicas || 0,
      desiredReplicas: hpa.status.desiredReplicas || 0,
      currentMetrics: hpa.status.currentMetrics || []
    }));

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

app.get("/api/experiments/summary", (req, res) => {
  const reports = readAllJsonReports();

  res.json({
    summary: summarizeExperiments(reports),
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
    return res.status(404).json({
      error: "CSV export not found"
    });
  }

  res.setHeader("Content-Type", "text/csv");
  res.send(fs.readFileSync(csvPath, "utf8"));
});

app.get("/api/experiments/export/markdown", (req, res) => {
  const markdownDir = path.join(REPORTS_DIR, "markdown");

  if (!fs.existsSync(markdownDir)) {
    return res.status(404).json({
      error: "Markdown reports directory not found"
    });
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`dashboard-api running on port ${PORT}`);
});
