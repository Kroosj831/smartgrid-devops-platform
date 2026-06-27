import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:13002";
const cpuDurationMs = __ENV.CPU_DURATION_MS || "100";
const experimentId = __ENV.EXPERIMENT_ID || "HPA-DIAGNOSTIC";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "60s",
  discardResponseBodies: true,
  thresholds: {
    http_req_failed: ["rate<0.05"]
  }
};

export default function () {
  const response = http.get(
    `${baseUrl}/cpu-load?duration=${cpuDurationMs}`,
    {
      headers: {
        "x-experiment-id": experimentId
      },
      timeout: "10s"
    }
  );

  check(response, {
    "cpu-load status is 200": (result) => result.status === 200
  });

  sleep(Number(__ENV.SLEEP_SECONDS || 0.1));
}
