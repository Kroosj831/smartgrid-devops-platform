import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import * as k8s from "@kubernetes/client-node";

import {
  createReportStore
} from "./report-store.mjs";

import {
  buildEmptyHistoryResponse,
  buildEvaluationsResponse,
  buildExperimentsResponse,
  buildHistoryExperimentsResponse,
  buildHypothesisResponse,
  buildOverviewResponse,
  buildReadOnlyActionResponse
} from "./dashboard-compat.mjs";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SERVICES = [
  {
    name: "api-gateway",
    url: "http://api-gateway:3000/health"
  },
  {
    name: "iot-simulator",
    url: "http://iot-simulator:3001/health"
  },
  {
    name: "data-collector",
    url: "http://data-collector:3002/health"
  },
  {
    name: "processing-service",
    url: "http://processing-service:3003/health"
  },
  {
    name: "optimization-service",
    url: "http://optimization-service:3004/health"
  }
];

const DEMO_API_GATEWAY_URL =
  String(
    process.env.DEMO_API_GATEWAY_URL ||
    "http://api-gateway:3000"
  ).replace(
    /\/+$/,
    ""
  );


const DEMO_REQUEST_TIMEOUT_MS =
  Number(
    process.env.DEMO_REQUEST_TIMEOUT_MS ||
    30000
  );


const DEMO_METRICS_TIMEOUT_MS =
  Number(
    process.env.DEMO_METRICS_TIMEOUT_MS ||
    5000
  );


const DEMO_METRIC_SERVICES =
  DEFAULT_SERVICES.map(
    (service) => ({
      id: service.name,
      label:
        service.name
          .split("-")
          .map(
            (part) =>
              part.charAt(0).toUpperCase() +
              part.slice(1)
          )
          .join(" "),
      metricsUrl:
        service.url.replace(
          /\/health$/,
          "/metrics"
        )
    })
  );




const DEMO_WORKFLOW_ROUTES =
  Object.freeze({
    "api-gateway": {
      method: "POST",
      route:
        "/smartgrid/simulate"
    },

    "iot-simulator": {
      method: "GET",
      route:
        "/simulate"
    },

    "data-collector": {
      method: "POST",
      route:
        "/data"
    },

    "processing-service": {
      method: "POST",
      route:
        "/process"
    },

    "optimization-service": {
      method: "POST",
      route:
        "/optimize"
    }
  });


function asyncRoute(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response);
    } catch (error) {
      next(error);
    }
  };
}


async function callKubernetesApi(modernCall, legacyCall) {
  try {
    const result = await modernCall();
    return result?.body ?? result;
  } catch (modernError) {
    if (!legacyCall) {
      throw modernError;
    }

    const result = await legacyCall();
    return result?.body ?? result;
  }
}


function createKubernetesReaders(namespace) {
  let clients = null;

  function getClients() {
    if (clients) {
      return clients;
    }

    const kubeConfig = new k8s.KubeConfig();

    try {
      kubeConfig.loadFromCluster();
    } catch {
      kubeConfig.loadFromDefault();
    }

    clients = {
      coreApi: kubeConfig.makeApiClient(
        k8s.CoreV1Api
      ),

      appsApi: kubeConfig.makeApiClient(
        k8s.AppsV1Api
      ),

      autoscalingApi: kubeConfig.makeApiClient(
        k8s.AutoscalingV2Api
      )
    };

    return clients;
  }


  async function listPods() {
    const { coreApi } = getClients();

    const data = await callKubernetesApi(
      () => coreApi.listNamespacedPod({
        namespace
      }),

      () => coreApi.listNamespacedPod(
        namespace
      )
    );

    return (data.items ?? []).map((pod) => ({
      name: pod.metadata?.name ?? null,
      namespace:
        pod.metadata?.namespace ?? namespace,
      phase: pod.status?.phase ?? "Unknown",
      podIP: pod.status?.podIP ?? null,
      nodeName: pod.spec?.nodeName ?? null,

      containers: (
        pod.status?.containerStatuses ?? []
      ).map((container) => ({
        name: container.name,
        ready: container.ready,
        restartCount:
          container.restartCount ?? 0,
        image: container.image
      }))
    }));
  }


  async function listDeployments() {
    const { appsApi } = getClients();

    const data = await callKubernetesApi(
      () => appsApi.listNamespacedDeployment({
        namespace
      }),

      () => appsApi.listNamespacedDeployment(
        namespace
      )
    );

    return (data.items ?? []).map(
      (deployment) => ({
        name:
          deployment.metadata?.name ?? null,

        namespace:
          deployment.metadata?.namespace ??
          namespace,

        replicas:
          deployment.spec?.replicas ?? 0,

        readyReplicas:
          deployment.status?.readyReplicas ?? 0,

        availableReplicas:
          deployment.status
            ?.availableReplicas ?? 0,

        updatedReplicas:
          deployment.status?.updatedReplicas ?? 0
      })
    );
  }


  async function listHpas() {
    const { autoscalingApi } = getClients();

    const data = await callKubernetesApi(
      () =>
        autoscalingApi
          .listNamespacedHorizontalPodAutoscaler({
            namespace
          }),

      () =>
        autoscalingApi
          .listNamespacedHorizontalPodAutoscaler(
            namespace
          )
    );

    return (data.items ?? []).map((hpa) => ({
      name: hpa.metadata?.name ?? null,
      namespace:
        hpa.metadata?.namespace ?? namespace,
      minReplicas: hpa.spec?.minReplicas ?? 1,
      maxReplicas: hpa.spec?.maxReplicas ?? 1,
      currentReplicas:
        hpa.status?.currentReplicas ?? 0,
      desiredReplicas:
        hpa.status?.desiredReplicas ?? 0,
      currentMetrics:
        hpa.status?.currentMetrics ?? []
    }));
  }


  return {
    listPods,
    listDeployments,
    listHpas
  };
}


async function checkSingleService(service) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    3000
  );

  try {
    const response = await fetch(
      service.url,
      {
        signal: controller.signal
      }
    );

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return {
      name: service.name,
      status: response.ok ? "UP" : "DOWN",
      httpStatus: response.status,
      data
    };
  } catch (error) {
    return {
      name: service.name,
      status: "DOWN",
      error:
        error.name === "AbortError"
          ? "Timeout"
          : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}


async function checkServices(services) {
  return Promise.all(
    services.map(checkSingleService)
  );
}



async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 5000
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}


async function readResponsePayload(
  upstreamResponse
) {
  const contentType =
    upstreamResponse.headers.get(
      "content-type"
    ) || "";

  const rawContent =
    await upstreamResponse.text();

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      return JSON.parse(
        rawContent
      );
    } catch {
      return {
        error:
          "Réponse JSON invalide",
        rawContent
      };
    }
  }

  try {
    return JSON.parse(
      rawContent
    );
  } catch {
    return {
      rawContent
    };
  }
}


function normalizeDemoIdentifier(
  value,
  fallback
) {
  const identifier =
    String(
      value || fallback
    ).trim();

  if (
    !/^[A-Za-z0-9._:-]{1,160}$/
      .test(identifier)
  ) {
    return null;
  }

  return identifier;
}



function parsePrometheusLabels(
  labelsText
) {
  const labels = {};

  const pattern =
    /([A-Za-z_][A-Za-z0-9_]*)="((?:\\.|[^"])*)"/g;

  let match = null;

  while (
    (
      match =
        pattern.exec(
          labelsText
        )
    ) !== null
  ) {
    labels[match[1]] =
      match[2]
        .replaceAll(
          '\\"',
          '"'
        )
        .replaceAll(
          "\\\\",
          "\\"
        );
  }

  return labels;
}


function parseLabeledMetricSamples(
  metricsText,
  metricName
) {
  const pattern =
    new RegExp(
      "^" +
      metricName +
      "\\\\{([^}]*)\\\\}" +
      "\\\\s+" +
      "([-+0-9.eE]+)" +
      "$"
    );

  return String(
    metricsText || ""
  )
    .split(/\r?\n/)
    .map(
      (line) =>
        line.trim()
    )
    .filter(
      (line) =>
        line.startsWith(
          `${metricName}{`
        )
    )
    .map(
      (line) => {
        const match =
          line.match(
            pattern
          );

        if (!match) {
          return null;
        }

        const value =
          Number(
            match[2]
          );

        if (
          !Number.isFinite(value)
        ) {
          return null;
        }

        return {
          labels:
            parsePrometheusLabels(
              match[1]
            ),

          value
        };
      }
    )
    .filter(Boolean);
}


function sumWorkflowRequests(
  metricsText,
  serviceId
) {
  const routeDefinition =
    DEMO_WORKFLOW_ROUTES[
      serviceId
    ];

  if (!routeDefinition) {
    return 0;
  }

  return parseLabeledMetricSamples(
    metricsText,
    "http_requests_total"
  )
    .filter(
      (sample) =>
        sample.labels.service ===
          serviceId &&
        sample.labels.method ===
          routeDefinition.method &&
        sample.labels.route ===
          routeDefinition.route
    )
    .reduce(
      (total, sample) =>
        total + sample.value,
      0
    );
}


function parseMetricValues(
  metricsText,
  metricName
) {
  return String(
    metricsText || ""
  )
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.startsWith(
          `${metricName}{`
        ) ||
        line.startsWith(
          `${metricName} `
        )
    )
    .map(
      (line) =>
        Number(
          line
            .trim()
            .split(/\s+/)
            .at(-1)
        )
    )
    .filter(
      (value) =>
        Number.isFinite(value)
    );
}


function sumMetricValues(
  metricsText,
  metricName
) {
  return parseMetricValues(
    metricsText,
    metricName
  ).reduce(
    (total, value) =>
      total + value,
    0
  );
}


function firstMetricValue(
  metricsText,
  metricName
) {
  const values =
    parseMetricValues(
      metricsText,
      metricName
    );

  return values.length
    ? values[0]
    : null;
}


function roundMetric(
  value,
  precision = 6
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return null;
  }

  return Number(
    number.toFixed(
      precision
    )
  );
}


function parseServiceMetrics(
  metricsText,
  serviceId
) {
  const cpuUserSeconds =
    sumMetricValues(
      metricsText,
      "process_cpu_user_seconds_total"
    );

  const cpuSystemSeconds =
    sumMetricValues(
      metricsText,
      "process_cpu_system_seconds_total"
    );

  const memoryBytes =
    firstMetricValue(
      metricsText,
      "process_resident_memory_bytes"
    );

  const heapUsedBytes =
    firstMetricValue(
      metricsText,
      "nodejs_heap_size_used_bytes"
    );

  const httpRequestsTotal =
    sumMetricValues(
      metricsText,
      "http_requests_total"
    );

  const workflowRequestsTotal =
    sumWorkflowRequests(
      metricsText,
      serviceId
    );

  return {
    cpuUserSeconds:
      roundMetric(
        cpuUserSeconds
      ),

    cpuSystemSeconds:
      roundMetric(
        cpuSystemSeconds
      ),

    cpuSecondsTotal:
      roundMetric(
        cpuUserSeconds +
        cpuSystemSeconds
      ),

    memoryBytes:
      memoryBytes === null
        ? null
        : Math.round(
            memoryBytes
          ),

    memoryMiB:
      memoryBytes === null
        ? null
        : roundMetric(
            memoryBytes /
            (1024 * 1024),
            3
          ),

    heapUsedBytes:
      heapUsedBytes === null
        ? null
        : Math.round(
            heapUsedBytes
          ),

    heapUsedMiB:
      heapUsedBytes === null
        ? null
        : roundMetric(
            heapUsedBytes /
            (1024 * 1024),
            3
          ),

    httpRequestsTotal:
      roundMetric(
        httpRequestsTotal,
        0
      ),

    workflowRequestsTotal:
      roundMetric(
        workflowRequestsTotal,
        0
      )
  };
}


async function collectSingleDemoMetric(
  service
) {
  const startedAt =
    process.hrtime.bigint();

  try {
    const upstreamResponse =
      await fetchWithTimeout(
        service.metricsUrl,
        {
          headers: {
            accept:
              "text/plain"
          }
        },
        DEMO_METRICS_TIMEOUT_MS
      );

    const metricsText =
      await upstreamResponse.text();

    if (
      !upstreamResponse.ok
    ) {
      throw new Error(
        `HTTP ${upstreamResponse.status}`
      );
    }

    const scrapeDurationMs =
      Number(
        process.hrtime.bigint() -
        startedAt
      ) / 1_000_000;

    return {
      id:
        service.id,

      label:
        service.label,

      status:
        "UP",

      metricsUrl:
        service.metricsUrl,

      scrapeDurationMs:
        roundMetric(
          scrapeDurationMs,
          3
        ),

      ...parseServiceMetrics(
        metricsText,
        service.id
      ),

      error:
        null
    };
  } catch (error) {
    const scrapeDurationMs =
      Number(
        process.hrtime.bigint() -
        startedAt
      ) / 1_000_000;

    return {
      id:
        service.id,

      label:
        service.label,

      status:
        "DOWN",

      metricsUrl:
        service.metricsUrl,

      scrapeDurationMs:
        roundMetric(
          scrapeDurationMs,
          3
        ),

      cpuUserSeconds:
        null,

      cpuSystemSeconds:
        null,

      cpuSecondsTotal:
        null,

      memoryBytes:
        null,

      memoryMiB:
        null,

      heapUsedBytes:
        null,

      heapUsedMiB:
        null,

      httpRequestsTotal:
        null,

      workflowRequestsTotal:
        null,

      error:
        error.name ===
        "AbortError"
          ? "Timeout"
          : error.message
    };
  }
}


async function collectDemoMetrics() {
  const sampledAt =
    new Date().toISOString();

  const services =
    await Promise.all(
      DEMO_METRIC_SERVICES.map(
        collectSingleDemoMetric
      )
    );

  return {
    sampledAt,

    source:
      "direct-service-scrape",

    scope:
      "current-process-state",

    services,

    summary: {
      totalServices:
        services.length,

      availableServices:
        services.filter(
          (service) =>
            service.status === "UP"
        ).length,

      unavailableServices:
        services.filter(
          (service) =>
            service.status !== "UP"
        ).length,

      totalMemoryMiB:
        roundMetric(
          services.reduce(
            (total, service) =>
              total +
              Number(
                service.memoryMiB || 0
              ),
            0
          ),
          3
        ),

      totalCpuSeconds:
        roundMetric(
          services.reduce(
            (total, service) =>
              total +
              Number(
                service.cpuSecondsTotal ||
                0
              ),
            0
          )
        ),

      totalHttpRequests:
        roundMetric(
          services.reduce(
            (total, service) =>
              total +
              Number(
                service.httpRequestsTotal ||
                0
              ),
            0
          ),
          0
        ),

      totalWorkflowRequests:
        roundMetric(
          services.reduce(
            (total, service) =>
              total +
              Number(
                service.workflowRequestsTotal ||
                0
              ),
            0
          ),
          0
        )
    },

    interpretation: {
      cpu:
        "Temps CPU cumulatif du processus depuis son démarrage.",

      memory:
        "Mémoire résidente observée au moment de l’échantillonnage.",

      requests:
        "Nombre cumulatif de toutes les requêtes HTTP traitées par le service.",

      workflowRequests:
        "Nombre cumulatif de requêtes appartenant exclusivement au workflow Smart Grid."
    }
  };
}


function csvEscape(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text = String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}


function buildEvaluationsCsv(model) {
  const rows = [[
    "hypothesis_id",
    "criterion_id",
    "metric",
    "aggregation",
    "observed",
    "unit",
    "operator",
    "threshold",
    "sample_size",
    "status"
  ]];

  for (const hypothesisId of ["H1", "H2"]) {
    const hypothesis =
      model.hypotheses?.[hypothesisId];

    for (
      const criterion
      of hypothesis?.criteriaResults ?? []
    ) {
      rows.push([
        hypothesisId,
        criterion.criterionId,
        criterion.metric,
        criterion.aggregation,
        criterion.observed,
        criterion.unit,
        criterion.operator,
        criterion.threshold,
        criterion.sampleSize,
        criterion.status
      ]);
    }
  }

  return (
    rows
      .map((row) =>
        row.map(csvEscape).join(",")
      )
      .join("\n") + "\n"
  );
}


function readFinalExperimentalSummary(
  reportsDir
) {
  const file =
    path.resolve(
      reportsDir,
      "final",
      "final-experimental-summary.json"
    );

  if (!fs.existsSync(file)) {
    const error =
      new Error(
        "Synthèse expérimentale finale introuvable"
      );

    error.code =
      "FINAL_SUMMARY_NOT_FOUND";

    throw error;
  }

  const content =
    fs.readFileSync(
      file,
      "utf8"
    );

  const summary =
    JSON.parse(content);

  if (
    summary.documentStatus !==
    "FINAL_OFFICIAL"
  ) {
    const error =
      new Error(
        "La synthèse finale n’est pas marquée FINAL_OFFICIAL"
      );

    error.code =
      "FINAL_SUMMARY_NOT_OFFICIAL";

    throw error;
  }

  if (
    Number(
      summary.totalOfficialRuns
    ) !== 12
  ) {
    const error =
      new Error(
        "Le nombre officiel d’exécutions est incohérent"
      );

    error.code =
      "FINAL_SUMMARY_RUN_COUNT_MISMATCH";

    throw error;
  }

  return summary;
}


function readMarkdownEvaluations(reportsDir) {
  const directory = path.resolve(
    reportsDir,
    "evaluations"
  );

  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => ({
      file,
      content: fs.readFileSync(
        path.join(directory, file),
        "utf8"
      )
    }));
}


const OFFICIAL_EXPORT_FILES = Object.freeze({
  "final-summary-json": {
    categoryId:
      "final-summary",

    label:
      "Synthèse finale JSON",

    description:
      "Document scientifique final officiel structuré.",

    relativePath:
      "final/final-experimental-summary.json",

    filename:
      "final-experimental-summary.json",

    format:
      "JSON",

    contentType:
      "application/json; charset=utf-8"
  },

  "final-summary-csv": {
    categoryId:
      "final-summary",

    label:
      "Synthèse finale CSV",

    description:
      "Résultats consolidés et références expérimentales.",

    relativePath:
      "final/final-experimental-summary.csv",

    filename:
      "final-experimental-summary.csv",

    format:
      "CSV",

    contentType:
      "text/csv; charset=utf-8"
  },

  "final-summary-markdown": {
    categoryId:
      "final-summary",

    label:
      "Synthèse finale Markdown",

    description:
      "Version lisible de la synthèse scientifique finale.",

    relativePath:
      "final/final-experimental-summary.md",

    filename:
      "final-experimental-summary.md",

    format:
      "Markdown",

    contentType:
      "text/markdown; charset=utf-8"
  },

  "experimental-results-csv": {
    categoryId:
      "detailed-results",

    label:
      "Résultats expérimentaux détaillés",

    description:
      "Table structurée des résultats retenus pour H1 et H2.",

    relativePath:
      "csv/experimental-results.csv",

    filename:
      "experimental-results.csv",

    format:
      "CSV",

    contentType:
      "text/csv; charset=utf-8"
  },

  "evaluations-index-json": {
    categoryId:
      "evaluations",

    label:
      "Index des évaluations",

    description:
      "Index canonique des douze exécutions officielles.",

    relativePath:
      "evaluations/index.json",

    filename:
      "evaluations-index.json",

    format:
      "JSON",

    contentType:
      "application/json; charset=utf-8"
  },

  "final-checksums": {
    categoryId:
      "integrity",

    label:
      "Empreintes de la synthèse finale",

    description:
      "Manifest SHA-256 des trois formats de synthèse finale.",

    relativePath:
      "final/checksums.sha256",

    filename:
      "final-checksums.sha256",

    format:
      "SHA-256",

    contentType:
      "text/plain; charset=utf-8"
  },

  "official-artifacts-checksums": {
    categoryId:
      "integrity",

    label:
      "Empreintes des artefacts officiels",

    description:
      "Manifest SHA-256 incluant le CSV expérimental.",

    relativePath:
      "final/official-artifacts.sha256",

    filename:
      "official-artifacts.sha256",

    format:
      "SHA-256",

    contentType:
      "text/plain; charset=utf-8"
  }
});


const EXPORT_CATEGORIES = [
  {
    id:
      "final-summary",

    label:
      "Synthèse finale",

    description:
      "Documents finaux officiels aux formats JSON, CSV et Markdown."
  },

  {
    id:
      "detailed-results",

    label:
      "Résultats détaillés",

    description:
      "Résultats expérimentaux consolidés sous forme tabulaire."
  },

  {
    id:
      "evaluations",

    label:
      "Évaluations",

    description:
      "Index officiel des douze exécutions évaluées."
  },

  {
    id:
      "integrity",

    label:
      "Intégrité",

    description:
      "Manifestes permettant de vérifier les empreintes SHA-256."
  },

  {
    id:
      "dynamic",

    label:
      "Exports dynamiques",

    description:
      "Exports en lecture seule construits par le Dashboard API."
  }
];


function resolveReportFile(
  reportsDir,
  relativePath
) {
  const root =
    path.resolve(
      reportsDir
    );

  const file =
    path.resolve(
      root,
      relativePath
    );

  if (
    file !== root &&
    !file.startsWith(
      `${root}${path.sep}`
    )
  ) {
    const error =
      new Error(
        "Chemin d’export non autorisé"
      );

    error.code =
      "EXPORT_PATH_FORBIDDEN";

    throw error;
  }

  return file;
}


function sha256File(file) {
  const hash =
    createHash(
      "sha256"
    );

  hash.update(
    fs.readFileSync(file)
  );

  return hash.digest(
    "hex"
  );
}


function describeOfficialExport(
  reportsDir,
  exportId,
  definition
) {
  const file =
    resolveReportFile(
      reportsDir,
      definition.relativePath
    );

  const available =
    fs.existsSync(file) &&
    fs.statSync(file).isFile();

  return {
    id:
      exportId,

    categoryId:
      definition.categoryId,

    label:
      definition.label,

    description:
      definition.description,

    type:
      "official_file",

    format:
      definition.format,

    filename:
      definition.filename,

    contentType:
      definition.contentType,

    sourcePath:
      `reports/${definition.relativePath}`,

    downloadPath:
      `/api/exports/files/${exportId}`,

    available,

    sizeBytes:
      available
        ? fs.statSync(file).size
        : null,

    sha256:
      available
        ? sha256File(file)
        : null
  };
}


function buildEvaluationsMarkdown(
  reportsDir
) {
  const files =
    readMarkdownEvaluations(
      reportsDir
    );

  const content =
    files.map(
      (file) => [
        `<!-- Source : ${file.file} -->`,
        "",
        file.content.trim()
      ].join("\n")
    ).join(
      "\n\n---\n\n"
    );

  return `${content}\n`;
}


function verifyChecksumManifest(
  reportsDir,
  relativeManifestPath
) {
  const manifest =
    resolveReportFile(
      reportsDir,
      relativeManifestPath
    );

  if (!fs.existsSync(manifest)) {
    return {
      manifest:
        `reports/${relativeManifestPath}`,

      status:
        "MISSING",

      totalEntries:
        0,

      verifiedEntries:
        0,

      failures: [
        "Manifest introuvable"
      ]
    };
  }

  const reportsRoot =
    path.resolve(
      reportsDir
    );

  const manifestDirectory =
    path.dirname(
      manifest
    );

  const lines =
    fs.readFileSync(
      manifest,
      "utf8"
    )
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  const failures = [];
  let verifiedEntries = 0;

  for (const line of lines) {
    const match =
      line.match(
        /^([a-fA-F0-9]{64})\s+(.+)$/
      );

    if (!match) {
      failures.push(
        `Ligne invalide : ${line}`
      );

      continue;
    }

    const expectedHash =
      match[1].toLowerCase();

    const referencedPath =
      match[2];

    const target =
      path.resolve(
        manifestDirectory,
        referencedPath
      );

    if (
      target !== reportsRoot &&
      !target.startsWith(
        `${reportsRoot}${path.sep}`
      )
    ) {
      failures.push(
        `Chemin interdit : ${referencedPath}`
      );

      continue;
    }

    if (!fs.existsSync(target)) {
      failures.push(
        `Fichier absent : ${referencedPath}`
      );

      continue;
    }

    const actualHash =
      sha256File(
        target
      );

    if (
      actualHash !==
      expectedHash
    ) {
      failures.push(
        `Empreinte différente : ${referencedPath}`
      );

      continue;
    }

    verifiedEntries += 1;
  }

  return {
    manifest:
      `reports/${relativeManifestPath}`,

    status:
      failures.length === 0 &&
      verifiedEntries === lines.length
        ? "VERIFIED"
        : "FAILED",

    totalEntries:
      lines.length,

    verifiedEntries,

    failures
  };
}


function buildExportsManifest(
  reportsDir,
  model
) {
  const officialItems =
    Object.entries(
      OFFICIAL_EXPORT_FILES
    ).map(
      ([
        exportId,
        definition
      ]) =>
        describeOfficialExport(
          reportsDir,
          exportId,
          definition
        )
    );

  const evaluationsJson =
    `${JSON.stringify(
      buildEvaluationsResponse(
        model
      ),
      null,
      2
    )}\n`;

  const evaluationsCsv =
    buildEvaluationsCsv(
      model
    );

  const evaluationsMarkdown =
    buildEvaluationsMarkdown(
      reportsDir
    );

  const dynamicItems = [
    {
      id:
        "dynamic-evaluations-json",

      categoryId:
        "dynamic",

      label:
        "Évaluations dynamiques JSON",

      description:
        "Vue structurée des douze exécutions et des verdicts.",

      type:
        "dynamic_export",

      format:
        "JSON",

      filename:
        "smartgrid-evaluations.json",

      contentType:
        "application/json; charset=utf-8",

      sourcePath:
        "/api/evaluations",

      downloadPath:
        "/api/experiments/export/json",

      available:
        true,

      sizeBytes:
        Buffer.byteLength(
          evaluationsJson
        ),

      sha256:
        null
    },

    {
      id:
        "dynamic-evaluations-csv",

      categoryId:
        "dynamic",

      label:
        "Évaluations dynamiques CSV",

      description:
        "Critères d’évaluation H1 et H2 sous forme tabulaire.",

      type:
        "dynamic_export",

      format:
        "CSV",

      filename:
        "smartgrid-evaluations.csv",

      contentType:
        "text/csv; charset=utf-8",

      sourcePath:
        "Dashboard API",

      downloadPath:
        "/api/experiments/export/csv",

      available:
        true,

      sizeBytes:
        Buffer.byteLength(
          evaluationsCsv
        ),

      sha256:
        null
    },

    {
      id:
        "dynamic-evaluations-markdown",

      categoryId:
        "dynamic",

      label:
        "Évaluations dynamiques Markdown",

      description:
        "Évaluations lisibles des hypothèses H1 et H2.",

      type:
        "dynamic_export",

      format:
        "Markdown",

      filename:
        "smartgrid-evaluations.md",

      contentType:
        "text/markdown; charset=utf-8",

      sourcePath:
        "reports/evaluations/*.md",

      downloadPath:
        "/api/experiments/export/markdown",

      available:
        true,

      sizeBytes:
        Buffer.byteLength(
          evaluationsMarkdown
        ),

      sha256:
        null
    }
  ];

  const items = [
    ...officialItems,
    ...dynamicItems
  ];

  const integrityChecks = [
    verifyChecksumManifest(
      reportsDir,
      "final/checksums.sha256"
    ),

    verifyChecksumManifest(
      reportsDir,
      "final/official-artifacts.sha256"
    )
  ];

  const categories =
    EXPORT_CATEGORIES.map(
      (category) => ({
        ...category,

        items:
          items.filter(
            (item) =>
              item.categoryId ===
              category.id
          )
      })
    );

  return {
    generatedAt:
      new Date().toISOString(),

    readOnly:
      true,

    documentStatus:
      readFinalExperimentalSummary(
        reportsDir
      ).documentStatus,

    totals: {
      totalItems:
        items.length,

      availableItems:
        items.filter(
          (item) =>
            item.available
        ).length,

      officialFiles:
        officialItems.length,

      dynamicExports:
        dynamicItems.length
    },

    integrity: {
      status:
        integrityChecks.every(
          (check) =>
            check.status ===
            "VERIFIED"
        )
          ? "VERIFIED"
          : "FAILED",

      checks:
        integrityChecks
    },

    categories
  };
}


export function createDashboardApp({
  reportsDir =
    process.env.REPORTS_DIR ||
    path.join(__dirname, "reports"),

  namespace =
    process.env.SMARTGRID_NAMESPACE ||
    "smartgrid-dev",

  services = DEFAULT_SERVICES,

  kubernetes = null
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors());

  app.use(
    express.json({
      limit: "256kb"
    })
  );

  const reportStore = createReportStore({
    reportsDir
  });

  const kubernetesReaders =
    kubernetes ??
    createKubernetesReaders(namespace);

  function loadModel() {
    return reportStore.loadDashboardModel();
  }


  app.get(
    "/dashboard/health",
    (request, response) => {
      response.json({
        service: "dashboard-api",
        status: "UP",
        storageMode: "filesystem",
        actionsEnabled: false,
        namespace,
        reports: reportStore.getHealth(),
        timestamp: new Date().toISOString()
      });
    }
  );


  app.get(
    "/api/overview",
    asyncRoute(async (request, response) => {
      const [
        model,
        serviceStatuses
      ] = await Promise.all([
        Promise.resolve(loadModel()),
        checkServices(services)
      ]);

      response.json(
        buildOverviewResponse({
          model,
          namespace,
          services: serviceStatuses
        })
      );
    })
  );


  app.get(
    "/api/kubernetes/pods",
    asyncRoute(async (request, response) => {
      const pods =
        await kubernetesReaders.listPods();

      response.json({
        namespace,
        count: pods.length,
        pods,
        timestamp: new Date().toISOString()
      });
    })
  );


  app.get(
    "/api/kubernetes/deployments",
    asyncRoute(async (request, response) => {
      const deployments =
        await kubernetesReaders
          .listDeployments();

      response.json({
        namespace,
        count: deployments.length,
        deployments,
        timestamp: new Date().toISOString()
      });
    })
  );


  app.get(
    "/api/kubernetes/hpa",
    asyncRoute(async (request, response) => {
      const hpas =
        await kubernetesReaders.listHpas();

      response.json({
        namespace,
        count: hpas.length,
        hpas,
        timestamp: new Date().toISOString()
      });
    })
  );


  app.get(
    "/api/experiments",
    (request, response) => {
      response.json(
        buildExperimentsResponse(loadModel())
      );
    }
  );


  app.get(
    "/api/history/experiments",
    (request, response) => {
      response.json(
        buildHistoryExperimentsResponse(
          loadModel()
        )
      );
    }
  );


  app.get(
    "/api/history/snapshots/kubernetes",
    (request, response) => {
      response.json(
        buildEmptyHistoryResponse(
          "snapshots"
        )
      );
    }
  );


  app.get(
    "/api/history/actions",
    (request, response) => {
      response.json(
        buildEmptyHistoryResponse("actions")
      );
    }
  );


  app.get(
    "/api/final-summary",
    (request, response) => {
      try {
        const summary =
          readFinalExperimentalSummary(
            reportsDir
          );

        response.setHeader(
          "Cache-Control",
          "no-store"
        );

        response.json(summary);
      } catch (error) {
        if (
          error.code ===
          "FINAL_SUMMARY_NOT_FOUND"
        ) {
          return response.status(404).json({
            error: error.message,
            documentStatus:
              "NOT_AVAILABLE"
          });
        }

        if (
          error.code ===
          "FINAL_SUMMARY_NOT_OFFICIAL" ||
          error.code ===
          "FINAL_SUMMARY_RUN_COUNT_MISMATCH"
        ) {
          return response.status(409).json({
            error: error.message,
            documentStatus:
              "INCONSISTENT"
          });
        }

        throw error;
      }
    }
  );


  app.get(
    "/api/evaluations",
    (request, response) => {
      response.json(
        buildEvaluationsResponse(loadModel())
      );
    }
  );


  app.get(
    "/api/evaluations/:hypothesisId",
    (request, response) => {
      try {
        const evaluation =
          buildHypothesisResponse(
            loadModel(),
            request.params.hypothesisId
          );

        if (!evaluation) {
          return response.status(404).json({
            error: "Évaluation introuvable"
          });
        }

        response.json(evaluation);
      } catch (error) {
        response.status(400).json({
          error: error.message
        });
      }
    }
  );


  app.get(
    "/api/exports",
    (request, response) => {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.json(
        buildExportsManifest(
          reportsDir,
          loadModel()
        )
      );
    }
  );


  app.get(
    "/api/exports/files/:exportId",
    (request, response) => {
      const definition =
        OFFICIAL_EXPORT_FILES[
          request.params.exportId
        ];

      if (!definition) {
        return response.status(404).json({
          error:
            "Export officiel introuvable"
        });
      }

      const file =
        resolveReportFile(
          reportsDir,
          definition.relativePath
        );

      if (
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        return response.status(404).json({
          error:
            "Fichier scientifique introuvable"
        });
      }

      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.setHeader(
        "Content-Type",
        definition.contentType
      );

      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${definition.filename}"`
      );

      response.sendFile(
        file
      );
    }
  );


  app.get(
    "/api/experiments/export/json",
    (request, response) => {
      const content =
        `${JSON.stringify(
          buildEvaluationsResponse(
            loadModel()
          ),
          null,
          2
        )}\n`;

      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
      );

      response.setHeader(
        "Content-Disposition",
        'attachment; filename="smartgrid-evaluations.json"'
      );

      response.send(content);
    }
  );


  app.get(
    "/api/experiments/export/csv",
    (request, response) => {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      response.setHeader(
        "Content-Disposition",
        'attachment; filename="smartgrid-evaluations.csv"'
      );

      response.send(
        buildEvaluationsCsv(loadModel())
      );
    }
  );


  app.get(
    "/api/experiments/export/markdown",
    (request, response) => {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.setHeader(
        "Content-Type",
        "text/markdown; charset=utf-8"
      );

      response.setHeader(
        "Content-Disposition",
        'attachment; filename="smartgrid-evaluations.md"'
      );

      response.send(
        buildEvaluationsMarkdown(
          reportsDir
        )
      );
    }
  );


  app.get(
    "/api/demo/config",
    (request, response) => {
      response.setHeader(
        "Cache-Control",
        "no-store"
      );

      response.json({
        enabled: true,
        scientificResultsModified:
          false,
        gatewayUrl:
          DEMO_API_GATEWAY_URL,
        maximumDelayMs:
          2000,
        maximumRecommendedRequests:
          20,
        maximumRecommendedConcurrency:
          5,
        metricsSamplingRecommendationMs:
          500,
        timestamp:
          new Date().toISOString()
      });
    }
  );


  app.post(
    "/api/demo/simulate",
    asyncRoute(
      async (
        request,
        response
      ) => {
        const generatedRequestId =
          `DEMO-DASHBOARD-${Date.now()}-` +
          randomUUID()
            .replaceAll("-", "")
            .slice(0, 8);

        const requestId =
          normalizeDemoIdentifier(
            request.body?.requestId,
            generatedRequestId
          );

        const experimentId =
          normalizeDemoIdentifier(
            request.body?.experimentId,
            "DEMO-DASHBOARD-LIVE"
          );

        if (
          !requestId ||
          !experimentId
        ) {
          return response
            .status(400)
            .json({
              error:
                "requestId ou experimentId invalide",
              timestamp:
                new Date().toISOString()
            });
        }

        const requestedDelay =
          Number(
            request.body?.demoDelayMs ||
            0
          );

        const demoDelayMs =
          Number.isFinite(
            requestedDelay
          )
            ? Math.min(
                Math.max(
                  Math.floor(
                    requestedDelay
                  ),
                  0
                ),
                2000
              )
            : 0;

        const upstreamResponse =
          await fetchWithTimeout(
            `${DEMO_API_GATEWAY_URL}` +
            "/smartgrid/simulate",
            {
              method:
                "POST",

              headers: {
                "content-type":
                  "application/json",

                "x-request-id":
                  requestId,

                "x-experiment-id":
                  experimentId,

                "x-demo-delay-ms":
                  String(
                    demoDelayMs
                  )
              },

              body:
                JSON.stringify({})
            },
            DEMO_REQUEST_TIMEOUT_MS
          );

        const payload =
          await readResponsePayload(
            upstreamResponse
          );

        response.setHeader(
          "Cache-Control",
          "no-store"
        );

        response.setHeader(
          "x-request-id",
          requestId
        );

        response
          .status(
            upstreamResponse.status
          )
          .json(payload);
      }
    )
  );


  app.get(
    "/api/demo/traces",
    asyncRoute(
      async (
        request,
        response
      ) => {
        const requestedLimit =
          Number(
            request.query.limit ||
            50
          );

        const limit =
          Number.isFinite(
            requestedLimit
          )
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

        const upstreamResponse =
          await fetchWithTimeout(
            `${DEMO_API_GATEWAY_URL}` +
            `/smartgrid/traces?limit=${limit}`,
            {
              headers: {
                accept:
                  "application/json"
              }
            },
            5000
          );

        const payload =
          await readResponsePayload(
            upstreamResponse
          );

        response.setHeader(
          "Cache-Control",
          "no-store"
        );

        response
          .status(
            upstreamResponse.status
          )
          .json(payload);
      }
    )
  );


  app.get(
    "/api/demo/traces/:requestId",
    asyncRoute(
      async (
        request,
        response
      ) => {
        const requestId =
          normalizeDemoIdentifier(
            request.params.requestId,
            null
          );

        if (!requestId) {
          return response
            .status(400)
            .json({
              error:
                "requestId invalide",
              timestamp:
                new Date().toISOString()
            });
        }

        const upstreamResponse =
          await fetchWithTimeout(
            `${DEMO_API_GATEWAY_URL}` +
            "/smartgrid/traces/" +
            encodeURIComponent(
              requestId
            ),
            {
              headers: {
                accept:
                  "application/json"
              }
            },
            5000
          );

        const payload =
          await readResponsePayload(
            upstreamResponse
          );

        response.setHeader(
          "Cache-Control",
          "no-store"
        );

        response
          .status(
            upstreamResponse.status
          )
          .json(payload);
      }
    )
  );


  app.get(
    "/api/demo/metrics",
    asyncRoute(
      async (
        request,
        response
      ) => {
        response.setHeader(
          "Cache-Control",
          "no-store"
        );

        response.json(
          await collectDemoMetrics()
        );
      }
    )
  );


  const disabledActions = [
    [
      "/api/history/import-reports",
      "import-reports"
    ],
    [
      "/api/history/snapshots/kubernetes",
      "kubernetes-snapshot"
    ],
    [
      "/api/actions/k6",
      "k6"
    ],
    [
      "/api/actions/mttr",
      "mttr"
    ],
    [
      "/api/actions/scaling",
      "scaling"
    ],
    [
      "/api/actions/restart",
      "restart"
    ]
  ];


  for (
    const [route, action]
    of disabledActions
  ) {
    app.post(
      route,
      (request, response) => {
        response.status(423).json(
          buildReadOnlyActionResponse(action)
        );
      }
    );
  }


  app.use(
    (request, response) => {
      response.status(404).json({
        error: "Route introuvable",
        method: request.method,
        path: request.path
      });
    }
  );


  app.use(
    (
      error,
      request,
      response,
      next
    ) => {
      console.error(error);

      if (response.headersSent) {
        return next(error);
      }

      response.status(500).json({
        error:
          "Erreur interne du Dashboard API",
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  );


  return app;
}


export function startDashboardServer({
  port = Number(
    process.env.PORT || 4000
  ),

  host = "0.0.0.0",

  ...options
} = {}) {
  const app = createDashboardApp(options);

  return app.listen(
    port,
    host,
    () => {
      console.log(
        `dashboard-api running on ${host}:${port}`
      );

      console.log(
        "Storage mode: filesystem"
      );

      console.log(
        "Dashboard actions: disabled"
      );
    }
  );
}


if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(__filename)
) {
  startDashboardServer();
}
