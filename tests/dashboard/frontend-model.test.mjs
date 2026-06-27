import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardViewModel,
  buildHypothesisCard,
  fetchJson,
  getVerdictMetadata,
  loadDashboardData,
  normalizeVerdict,
  summarizeKubernetes
} from "../../dashboard/dashboard-frontend/src/dashboard-model.mjs";


test(
  "normalise les verdicts scientifiques",
  () => {
    assert.equal(
      normalizeVerdict(
        "validated"
      ),
      "VALIDATED"
    );

    assert.equal(
      normalizeVerdict(
        "rejected"
      ),
      "REJECTED"
    );

    assert.equal(
      normalizeVerdict(
        "inconnu"
      ),
      "INDETERMINATE"
    );
  }
);


test(
  "associe un libellé au verdict",
  () => {
    assert.deepEqual(
      getVerdictMetadata(
        "VALIDATED"
      ),
      {
        verdict:
          "VALIDATED",

        label:
          "Validée",

        tone:
          "success"
      }
    );
  }
);


test(
  "construit une carte hypothèse",
  () => {
    const card =
      buildHypothesisCard(
        "H1",
        {
          title:
            "Déploiement automatisé",

          verdict:
            "VALIDATED",

          totalRunsFound:
            9,

          totalValidRuns:
            9,

          scenarioCoverage: {
            scaling: {
              validRuns:
                3,

              requiredRuns:
                3,

              sufficient:
                true
            }
          }
        }
      );

    assert.equal(
      card.id,
      "H1"
    );

    assert.equal(
      card.verdict,
      "VALIDATED"
    );

    assert.equal(
      card.scenarios.length,
      1
    );

    assert.equal(
      card.scenarios[0]
        .sufficient,
      true
    );
  }
);


test(
  "normalise les critères scientifiques",
  () => {
    const card =
      buildHypothesisCard(
        "H2",
        {
          criteriaResults: [
            {
              criterionId:
                "H2-C1",

              metric:
                "latency_p95",

              observed:
                48.73,

              unit:
                "ms",

              status:
                "VALIDATED"
            }
          ]
        }
      );

    assert.equal(
      card.criteria[0].id,
      "H2-C1"
    );

    assert.equal(
      card.criteria[0]
        .observed,
      48.73
    );

    assert.equal(
      card.criteria[0].status,
      "VALIDATED"
    );
  }
);


test(
  "résume les ressources Kubernetes",
  () => {
    const summary =
      summarizeKubernetes({
        deployments: {
          deployments: [
            {
              readyReplicas:
                1
            },
            {
              readyReplicas:
                0
            }
          ]
        },

        pods: {
          pods: [
            {
              phase:
                "Running",

              containers: [
                {
                  restartCount:
                    2
                }
              ]
            }
          ]
        }
      });

    assert.equal(
      summary.totalDeployments,
      2
    );

    assert.equal(
      summary.activeDeployments,
      1
    );

    assert.equal(
      summary.runningPods,
      1
    );

    assert.equal(
      summary.totalRestarts,
      2
    );
  }
);


test(
  "construit le modèle complet du Dashboard",
  () => {
    const model =
      buildDashboardViewModel({
        health: {
          status:
            "UP",

          storageMode:
            "filesystem",

          actionsEnabled:
            false
        },

        evaluations: {
          totalRunsEvaluated:
            0,

          hypotheses: {
            H1: {
              verdict:
                "INDETERMINATE"
            },

            H2: {
              verdict:
                "INDETERMINATE"
            }
          }
        }
      });

    assert.equal(
      model.serviceStatus,
      "UP"
    );

    assert.equal(
      model.storageMode,
      "filesystem"
    );

    assert.equal(
      model.actionsEnabled,
      false
    );

    assert.equal(
      model.hypotheses.length,
      2
    );
  }
);


test(
  "fetchJson rejette une réponse HTTP invalide",
  async () => {
    await assert.rejects(
      () =>
        fetchJson(
          async () => ({
            ok:
              false,

            status:
              503
          }),

          "/api/test"
        ),

      /HTTP 503/
    );
  }
);


test(
  "le chargement partiel ne bloque pas le Dashboard",
  async () => {
    const responses = {
      "/dashboard/health": {
        status:
          "UP",

        storageMode:
          "filesystem",

        actionsEnabled:
          false
      },

      "/api/evaluations": {
        totalRunsEvaluated:
          0,

        hypotheses: {
          H1: {
            verdict:
              "INDETERMINATE"
          },

          H2: {
            verdict:
              "INDETERMINATE"
          }
        }
      },

      "/api/kubernetes/pods": {
        pods:
          []
      }
    };

    const fetchImplementation =
      async (url) => {
        if (
          url ===
          "/api/kubernetes/deployments"
        ) {
          return {
            ok:
              false,

            status:
              500
          };
        }

        return {
          ok:
            true,

          status:
            200,

          async json() {
            return responses[url];
          }
        };
      };

    const result =
      await loadDashboardData({
        fetchImplementation
      });

    assert.equal(
      result.errors.length,
      1
    );

    assert.equal(
      result.errors[0].key,
      "deployments"
    );

    assert.equal(
      result.viewModel
        .serviceStatus,
      "UP"
    );

    assert.equal(
      result.viewModel
        .hypotheses.length,
      2
    );
  }
);
