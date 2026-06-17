import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 20,
  duration: "2m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"]
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "max"]
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:30081";

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`);

  check(healthRes, {
    "health status is 200": (r) => r.status === 200
  });

  const simulateRes = http.get(`${BASE_URL}/simulate`);

  check(simulateRes, {
    "simulate status is 200": (r) => r.status === 200,
    "simulate returns data": (r) => r.body && r.body.includes("data")
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    "reports/json/k6-load-summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data)
  };
}

function textSummary(data) {
  const metrics = data.metrics;

  const totalRequests = metrics.http_reqs?.values?.count || 0;
  const failedRate = metrics.http_req_failed?.values?.rate || 0;
  const avgDuration = metrics.http_req_duration?.values?.avg || 0;
  const p95Duration = metrics.http_req_duration?.values?.["p(95)"] || 0;

  return `
# Résultat du test de charge k6

- Scénario : forte charge
- VUs : 20
- Durée : 2 minutes
- Requêtes totales : ${totalRequests}
- Taux d'échec : ${(failedRate * 100).toFixed(2)} %
- Latence moyenne : ${avgDuration.toFixed(2)} ms
- Latence p95 : ${p95Duration.toFixed(2)} ms
- Seuil taux d'échec : < 1 %
- Seuil latence p95 : < 500 ms

`;
}
