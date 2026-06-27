import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmptyHistoryResponse,
  buildEvaluationsResponse,
  buildExperimentsResponse,
  buildHistoryExperimentsResponse,
  buildHypothesesSummary,
  buildHypothesisResponse,
  buildOverviewResponse,
  buildReadOnlyActionResponse,
  summarizeDashboardModel
} from "../../dashboard/dashboard-api/dashboard-compat.mjs";


function createModel() {
  return {
    generatedAt:
      "2026-06-21T14:00:00Z",

    reportsHealth: {
      storageMode:
        "filesystem",

      evaluationIndexAvailable:
        true
    },

    index: {
      schemaVersion:
        "1.0",

      generatedAt:
        "2026-06-21T14:00:00Z",

      totalRunsEvaluated:
        2
    },

    hypotheses: {
      H1: {
        hypothesisId:
          "H1",

        title:
          "Automatisation",

        verdict:
          "VALIDATED",

        totalRunsFound:
          3,

        totalValidRuns:
          3,

        minimumValidRunsPerScenario:
          3,

        scenarioCoverage: {},

        criteriaResults: []
      },

      H2: {
        hypothesisId:
          "H2",

        title:
          "Observabilité",

        verdict:
          "INDETERMINATE",

        totalRunsFound:
          1,

        totalValidRuns:
          1,

        minimumValidRunsPerScenario:
          3,

        scenarioCoverage: {},

        criteriaResults: []
      }
    },

    rawExperiments: [
      {
        file:
          "experiments/nominal/run-001/result.json",

        runId:
          "run-001",

        data: {
          runId:
            "run-001",

          scenario:
            "nominal",

          status:
            "COMPLETED"
        }
      }
    ],

    runs: [
      {
        runId:
          "run-001",

        scenario:
          "nominal",

        verdict:
          "VALIDATED",

        sourceFile:
          "reports/experiments/nominal/run-001/result.json",

        evaluation: {
          runId:
            "run-001",

          scenario:
            "nominal",

          verdict:
            "VALIDATED",

          evaluatedAt:
            "2026-06-21T14:00:00Z",

          criteriaResults: [
            {
              hypothesisId:
                "H2",

              criterionId:
                "H2-C1",

              metric:
                "monitoring_coverage_percent",

              observed:
                100,

              unit:
                "%",

              threshold:
                100,

              operator:
                "==",

              status:
                "PASSED"
            }
          ]
        }
      },

      {
        runId:
          "run-002",

        scenario:
          "high_load",

        verdict:
          "INDETERMINATE",

        evaluation: {
          runId:
            "run-002",

          scenario:
            "high_load",

          verdict:
            "INDETERMINATE",

          criteriaResults: []
        }
      }
    ]
  };
}


test(
  "résume les verdicts des exécutions",
  () => {
    const summary =
      summarizeDashboardModel(
        createModel()
      );

    assert.equal(
      summary.total,
      2
    );

    assert.equal(
      summary.validated,
      1
    );

    assert.equal(
      summary.indeterminate,
      1
    );
  }
);


test(
  "construit le résumé H1 et H2",
  () => {
    const hypotheses =
      buildHypothesesSummary(
        createModel()
      );

    assert.equal(
      hypotheses.H1.verdict,
      "VALIDATED"
    );

    assert.equal(
      hypotheses.H2.verdict,
      "INDETERMINATE"
    );
  }
);


test(
  "préserve le contrat de la route overview",
  () => {
    const response =
      buildOverviewResponse({
        model:
          createModel(),

        namespace:
          "smartgrid-dev",

        services: [
          {
            name:
              "api-gateway",

            status:
              "UP"
          }
        ]
      });

    assert.equal(
      response.namespace,
      "smartgrid-dev"
    );

    assert.equal(
      response.services.length,
      1
    );

    assert.equal(
      response.experiments.total,
      2
    );

    assert.equal(
      response.history.experimentResults,
      2
    );

    assert.equal(
      response.actionsEnabled,
      false
    );
  }
);


test(
  "préserve le tableau reports de la route experiments",
  () => {
    const response =
      buildExperimentsResponse(
        createModel()
      );

    assert.equal(
      response.count,
      1
    );

    assert.equal(
      response.reports[0].data.scenario,
      "nominal"
    );
  }
);


test(
  "convertit les critères en historique compatible",
  () => {
    const response =
      buildHistoryExperimentsResponse(
        createModel()
      );

    assert.equal(
      response.count,
      2
    );

    assert.equal(
      response.results[0].metric_name,
      "monitoring_coverage_percent"
    );

    assert.equal(
      response.results[0].status,
      "PASSED"
    );

    assert.equal(
      response.storageMode,
      "filesystem"
    );
  }
);


test(
  "retourne des historiques vides compatibles",
  () => {
    const snapshots =
      buildEmptyHistoryResponse(
        "snapshots"
      );

    const actions =
      buildEmptyHistoryResponse(
        "actions"
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
  "construit le modèle des évaluations",
  () => {
    const response =
      buildEvaluationsResponse(
        createModel()
      );

    assert.equal(
      response.totalRunsEvaluated,
      2
    );

    assert.equal(
      response.hypotheses.H1.verdict,
      "VALIDATED"
    );
  }
);


test(
  "retourne une hypothèse précise",
  () => {
    const evaluation =
      buildHypothesisResponse(
        createModel(),
        "h2"
      );

    assert.equal(
      evaluation.hypothesisId,
      "H2"
    );

    assert.throws(
      () =>
        buildHypothesisResponse(
          createModel(),
          "H3"
        ),
      /Hypothèse inconnue/
    );
  }
);


test(
  "produit une réponse explicite pour une action désactivée",
  () => {
    const response =
      buildReadOnlyActionResponse(
        "k6"
      );

    assert.equal(
      response.status,
      "DISABLED"
    );

    assert.equal(
      response.readOnly,
      true
    );
  }
);
