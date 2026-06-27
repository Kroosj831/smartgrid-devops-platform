import assert from "node:assert/strict";
import test from "node:test";

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  createReportStore
} from "../../dashboard/dashboard-api/report-store.mjs";


function writeJson(filePath, data) {
  mkdirSync(
    join(filePath, ".."),
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


function createFixture() {
  const root = mkdtempSync(
    join(
      tmpdir(),
      "smartgrid-reports-"
    )
  );

  writeJson(
    join(
      root,
      "evaluations",
      "index.json"
    ),
    {
      schemaVersion: "1.0",
      totalRunsEvaluated: 1,
      runs: [
        {
          runId: "run-001",
          scenario: "nominal",
          evaluationFile:
            "reports/evaluations/runs/run-001-evaluation.json"
        }
      ],
      hypotheses: {
        H1: {
          verdict:
            "INDETERMINATE",
          evaluationFile:
            "reports/evaluations/H1-evaluation.json"
        },
        H2: {
          verdict:
            "INDETERMINATE",
          evaluationFile:
            "reports/evaluations/H2-evaluation.json"
        }
      }
    }
  );

  writeJson(
    join(
      root,
      "evaluations",
      "H1-evaluation.json"
    ),
    {
      hypothesisId: "H1",
      verdict: "INDETERMINATE"
    }
  );

  writeJson(
    join(
      root,
      "evaluations",
      "H2-evaluation.json"
    ),
    {
      hypothesisId: "H2",
      verdict: "INDETERMINATE"
    }
  );

  writeJson(
    join(
      root,
      "evaluations",
      "runs",
      "run-001-evaluation.json"
    ),
    {
      runId: "run-001",
      scenario: "nominal",
      verdict: "VALIDATED"
    }
  );

  writeJson(
    join(
      root,
      "experiments",
      "nominal",
      "run-001",
      "result.json"
    ),
    {
      runId: "run-001",
      scenario: "nominal",
      status: "COMPLETED"
    }
  );

  return root;
}


test(
  "charge l'index d'évaluation",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      const index =
        store.loadEvaluationIndex();

      assert.equal(
        index.totalRunsEvaluated,
        1
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "résout une référence commençant par reports/",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      const evaluation =
        store.loadReferencedJson(
          "reports/evaluations/H1-evaluation.json"
        );

      assert.equal(
        evaluation.hypothesisId,
        "H1"
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "charge les évaluations H1 et H2",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      assert.equal(
        store
          .loadHypothesisEvaluation(
            "H1"
          )
          .verdict,
        "INDETERMINATE"
      );

      assert.equal(
        store
          .loadHypothesisEvaluation(
            "H2"
          )
          .verdict,
        "INDETERMINATE"
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "charge les évaluations individuelles",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      const runs =
        store.loadRunEvaluations();

      assert.equal(
        runs.length,
        1
      );

      assert.equal(
        runs[0].evaluation.runId,
        "run-001"
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "charge récursivement les result.json bruts",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      const results =
        store.loadRawExperimentResults();

      assert.equal(
        results.length,
        1
      );

      assert.equal(
        results[0].data.scenario,
        "nominal"
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "produit le modèle complet du Dashboard",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      const model =
        store.loadDashboardModel();

      assert.equal(
        model.storageMode,
        "filesystem"
      );

      assert.equal(
        model.index.totalRunsEvaluated,
        1
      );

      assert.equal(
        model.rawExperiments.length,
        1
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);


test(
  "refuse les chemins sortant de reports",
  () => {
    const root = createFixture();

    try {
      const store =
        createReportStore({
          reportsDir: root
        });

      assert.throws(
        () =>
          store.resolveReference(
            "../../etc/passwd"
          ),
        /hors du dossier reports/
      );
    } finally {
      rmSync(root, {
        recursive: true,
        force: true
      });
    }
  }
);
