import assert from "node:assert/strict";
import test, {
  after,
  before
} from "node:test";

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";

import { tmpdir } from "node:os";
import {
  dirname,
  join
} from "node:path";

import {
  createDashboardApp
} from "../../dashboard/dashboard-api/server.js";


let reportsDirectory;
let server;
let baseUrl;


function writeJson(filePath, data) {
  mkdirSync(
    dirname(filePath),
    {
      recursive: true
    }
  );

  writeFileSync(
    filePath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
}


before(async () => {
  reportsDirectory = mkdtempSync(
    join(
      tmpdir(),
      "dashboard-server-"
    )
  );

  writeJson(
    join(
      reportsDirectory,
      "evaluations",
      "index.json"
    ),
    {
      schemaVersion: "1.0",
      generatedAt:
        "2026-06-21T14:00:00Z",
      experimentResultsDirectory:
        "reports/experiments",
      totalRunsEvaluated: 0,
      runs: [],
      hypotheses: {
        H1: {
          verdict: "INDETERMINATE",
          totalRunsFound: 0,
          totalValidRuns: 0,
          evaluationFile:
            "reports/evaluations/H1-evaluation.json",
          markdownFile:
            "reports/evaluations/H1-evaluation.md"
        },
        H2: {
          verdict: "INDETERMINATE",
          totalRunsFound: 0,
          totalValidRuns: 0,
          evaluationFile:
            "reports/evaluations/H2-evaluation.json",
          markdownFile:
            "reports/evaluations/H2-evaluation.md"
        }
      }
    }
  );

  writeJson(
    join(
      reportsDirectory,
      "evaluations",
      "H1-evaluation.json"
    ),
    {
      schemaVersion: "1.0",
      hypothesisId: "H1",
      title: "Automatisation",
      verdict: "INDETERMINATE",
      minimumValidRunsPerScenario: 3,
      totalRunsFound: 0,
      totalValidRuns: 0,
      scenarioCoverage: {},
      criteriaResults: []
    }
  );

  writeJson(
    join(
      reportsDirectory,
      "evaluations",
      "H2-evaluation.json"
    ),
    {
      schemaVersion: "1.0",
      hypothesisId: "H2",
      title: "Observabilité",
      verdict: "INDETERMINATE",
      minimumValidRunsPerScenario: 3,
      totalRunsFound: 0,
      totalValidRuns: 0,
      scenarioCoverage: {},
      criteriaResults: []
    }
  );

  const app = createDashboardApp({
    reportsDir: reportsDirectory,
    namespace: "smartgrid-test",
    services: [],

    kubernetes: {
      async listPods() {
        return [
          {
            name: "pod-test",
            namespace: "smartgrid-test",
            phase: "Running",
            podIP: "10.42.0.10",
            containers: []
          }
        ];
      },

      async listDeployments() {
        return [
          {
            name: "deployment-test",
            namespace: "smartgrid-test",
            replicas: 1,
            readyReplicas: 1,
            availableReplicas: 1,
            updatedReplicas: 1
          }
        ];
      },

      async listHpas() {
        return [];
      }
    }
  });

  server = await new Promise((resolve) => {
    const instance = app.listen(
      0,
      "127.0.0.1",
      () => resolve(instance)
    );
  });

  const address = server.address();

  baseUrl =
    `http://127.0.0.1:${address.port}`;
});


after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  rmSync(
    reportsDirectory,
    {
      recursive: true,
      force: true
    }
  );
});


test(
  "health indique filesystem et lecture seule",
  async () => {
    const response = await fetch(
      `${baseUrl}/dashboard/health`
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.status, "UP");
    assert.equal(
      body.storageMode,
      "filesystem"
    );
    assert.equal(
      body.actionsEnabled,
      false
    );
    assert.equal(
      body.reports
        .evaluationIndexAvailable,
      true
    );
  }
);


test(
  "overview conserve le contrat du frontend",
  async () => {
    const response = await fetch(
      `${baseUrl}/api/overview`
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(
      body.namespace,
      "smartgrid-test"
    );

    assert.equal(
      body.experiments.total,
      0
    );

    assert.equal(
      body.history.experimentResults,
      0
    );

    assert.equal(
      body.hypotheses.H1.verdict,
      "INDETERMINATE"
    );

    assert.equal(
      body.actionsEnabled,
      false
    );
  }
);


test(
  "expose les évaluations H1 et H2",
  async () => {
    const response = await fetch(
      `${baseUrl}/api/evaluations`
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(
      body.totalRunsEvaluated,
      0
    );

    assert.equal(
      body.hypotheses.H1.verdict,
      "INDETERMINATE"
    );

    assert.equal(
      body.hypotheses.H2.verdict,
      "INDETERMINATE"
    );
  }
);


test(
  "retourne une hypothèse précise",
  async () => {
    const response = await fetch(
      `${baseUrl}/api/evaluations/H1`
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(
      body.hypothesisId,
      "H1"
    );

    assert.equal(
      body.verdict,
      "INDETERMINATE"
    );
  }
);


test(
  "préserve les routes Kubernetes en lecture",
  async () => {
    const podsResponse = await fetch(
      `${baseUrl}/api/kubernetes/pods`
    );

    const deploymentsResponse =
      await fetch(
        `${baseUrl}/api/kubernetes/deployments`
      );

    const hpaResponse = await fetch(
      `${baseUrl}/api/kubernetes/hpa`
    );

    assert.equal(
      podsResponse.status,
      200
    );

    assert.equal(
      deploymentsResponse.status,
      200
    );

    assert.equal(
      hpaResponse.status,
      200
    );

    const pods = await podsResponse.json();
    const deployments =
      await deploymentsResponse.json();
    const hpas =
      await hpaResponse.json();

    assert.equal(pods.count, 1);
    assert.equal(
      pods.pods[0].name,
      "pod-test"
    );

    assert.equal(
      deployments.count,
      1
    );

    assert.equal(
      deployments.deployments[0].name,
      "deployment-test"
    );

    assert.equal(hpas.count, 0);
  }
);


test(
  "préserve les anciennes routes history",
  async () => {
    const experiments = await fetch(
      `${baseUrl}/api/history/experiments`
    ).then((response) =>
      response.json()
    );

    const snapshots = await fetch(
      `${baseUrl}/api/history/snapshots/kubernetes`
    ).then((response) =>
      response.json()
    );

    const actions = await fetch(
      `${baseUrl}/api/history/actions`
    ).then((response) =>
      response.json()
    );

    assert.deepEqual(
      experiments.results,
      []
    );

    assert.equal(
      experiments.storageMode,
      "filesystem"
    );

    assert.deepEqual(
      snapshots.snapshots,
      []
    );

    assert.deepEqual(
      actions.actions,
      []
    );
  }
);


test(
  "bloque les actions expérimentales",
  async () => {
    const routes = [
      "/api/actions/k6",
      "/api/actions/mttr",
      "/api/actions/scaling",
      "/api/actions/restart",
      "/api/history/import-reports",
      "/api/history/snapshots/kubernetes"
    ];

    for (const route of routes) {
      const response = await fetch(
        `${baseUrl}${route}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({})
        }
      );

      assert.equal(
        response.status,
        423,
        route
      );

      const body =
        await response.json();

      assert.equal(
        body.status,
        "DISABLED",
        route
      );

      assert.equal(
        body.readOnly,
        true,
        route
      );
    }
  }
);


test(
  "génère les exports JSON CSV et Markdown",
  async () => {
    const jsonResponse = await fetch(
      `${baseUrl}/api/experiments/export/json`
    );

    assert.equal(
      jsonResponse.status,
      200
    );

    const json =
      await jsonResponse.json();

    assert.equal(
      json.totalRunsEvaluated,
      0
    );

    const csvResponse = await fetch(
      `${baseUrl}/api/experiments/export/csv`
    );

    assert.equal(
      csvResponse.status,
      200
    );

    assert.match(
      csvResponse.headers.get(
        "content-type"
      ),
      /text\/csv/
    );

    const csv =
      await csvResponse.text();

    assert.match(
      csv,
      /hypothesis_id/
    );

    const markdownResponse =
      await fetch(
        `${baseUrl}/api/experiments/export/markdown`
      );

    assert.equal(
      markdownResponse.status,
      200
    );

    const markdown =
      await markdownResponse.json();

    assert.equal(
      markdown.count,
      0
    );
  }
);
