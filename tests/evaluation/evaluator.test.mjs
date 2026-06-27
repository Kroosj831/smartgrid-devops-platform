import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateValues,
  calculateVerdict,
  compareValues,
  evaluateHypothesis,
  evaluateRun,
  isValidRun
} from "../../shared/evaluation/evaluator.mjs";


test("compareValues compare correctement les valeurs numériques", () => {
  assert.equal(compareValues(20, "<=", 30), true);
  assert.equal(compareValues(40, "<=", 30), false);
  assert.equal(compareValues(100, ">=", 100), true);
  assert.equal(compareValues(99, ">=", 100), false);
});


test("compareValues compare correctement les booléens", () => {
  assert.equal(compareValues(true, "==", true), true);
  assert.equal(compareValues(false, "==", true), false);
  assert.equal(compareValues(false, "!=", true), true);
});


test("aggregateValues calcule correctement la médiane", () => {
  assert.equal(
    aggregateValues([15, 17, 19], "median"),
    17
  );

  assert.equal(
    aggregateValues([10, 20, 30, 40], "median"),
    25
  );
});


test("aggregateValues calcule correctement la moyenne", () => {
  assert.equal(
    aggregateValues([10, 20, 30], "mean"),
    20
  );

  assert.equal(
    aggregateValues([0, 50, 100], "rate"),
    50
  );
});


test("aggregateValues vérifie correctement toutes les valeurs booléennes", () => {
  assert.equal(
    aggregateValues([true, true, true], "all"),
    true
  );

  assert.equal(
    aggregateValues([true, false, true], "all"),
    false
  );
});


test("calculateVerdict retourne VALIDATED lorsque tous les critères passent", () => {
  const results = [
    {
      required: true,
      status: "PASSED"
    },
    {
      required: true,
      status: "PASSED"
    }
  ];

  assert.equal(
    calculateVerdict(results),
    "VALIDATED"
  );
});


test("calculateVerdict retourne REJECTED lorsqu'un critère obligatoire échoue", () => {
  const results = [
    {
      required: true,
      status: "PASSED"
    },
    {
      required: true,
      status: "REJECTED"
    }
  ];

  assert.equal(
    calculateVerdict(results),
    "REJECTED"
  );
});


test("calculateVerdict retourne INDETERMINATE lorsqu'une métrique manque", () => {
  const results = [
    {
      required: true,
      status: "PASSED"
    },
    {
      required: true,
      status: "NOT_MEASURED"
    }
  ];

  assert.equal(
    calculateVerdict(results),
    "INDETERMINATE"
  );
});


test("isValidRun accepte uniquement une expérience terminée et valide", () => {
  assert.equal(
    isValidRun({
      status: "COMPLETED",
      validity: {
        isValid: true
      }
    }),
    true
  );

  assert.equal(
    isValidRun({
      status: "FAILED",
      validity: {
        isValid: true
      }
    }),
    false
  );

  assert.equal(
    isValidRun({
      status: "COMPLETED",
      validity: {
        isValid: false
      }
    }),
    false
  );
});


test("evaluateRun valide une expérience conforme", () => {
  const hypotheses = {
    H1: {
      id: "H1",
      criteria: [
        {
          id: "H1-C3",
          metric: "mttr_seconds",
          operator: "<=",
          threshold: 30,
          unit: "s",
          aggregation: "median",
          required: true,
          scenarios: [
            "controlled_failure"
          ]
        },
        {
          id: "H1-C5",
          metric: "service_restored",
          operator: "==",
          threshold: true,
          unit: "boolean",
          aggregation: "all",
          required: true,
          scenarios: [
            "controlled_failure"
          ]
        }
      ]
    }
  };

  const run = {
    schemaVersion: "1.0",
    runId: "controlled-failure-test-001",
    scenario: "controlled_failure",
    hypothesisIds: [
      "H1"
    ],
    status: "COMPLETED",
    validity: {
      isValid: true,
      reasons: []
    },
    startedAt: "2026-06-21T12:00:00Z",
    endedAt: "2026-06-21T12:00:18Z",
    metrics: {
      mttr_seconds: 18,
      service_restored: true
    },
    criteriaResults: [],
    verdict: "INDETERMINATE",
    evidence: []
  };

  const result = evaluateRun(
    run,
    hypotheses
  );

  assert.equal(
    result.verdict,
    "VALIDATED"
  );

  assert.equal(
    result.criteriaResults.length,
    2
  );

  assert.equal(
    result.criteriaResults[0].status,
    "PASSED"
  );

  assert.equal(
    result.criteriaResults[1].status,
    "PASSED"
  );
});


test("evaluateRun retourne INDETERMINATE lorsqu'une métrique manque", () => {
  const hypotheses = {
    H1: {
      id: "H1",
      criteria: [
        {
          id: "H1-C3",
          metric: "mttr_seconds",
          operator: "<=",
          threshold: 30,
          unit: "s",
          aggregation: "median",
          required: true,
          scenarios: [
            "controlled_failure"
          ]
        }
      ]
    }
  };

  const run = {
    schemaVersion: "1.0",
    runId: "controlled-failure-test-002",
    scenario: "controlled_failure",
    hypothesisIds: [
      "H1"
    ],
    status: "COMPLETED",
    metrics: {},
    criteriaResults: [],
    verdict: "INDETERMINATE",
    evidence: []
  };

  const result = evaluateRun(
    run,
    hypotheses
  );

  assert.equal(
    result.verdict,
    "INDETERMINATE"
  );

  assert.equal(
    result.criteriaResults[0].status,
    "NOT_MEASURED"
  );
});


test("evaluateHypothesis reste INDETERMINATE sans trois exécutions", () => {
  const hypothesis = {
    id: "H1",
    title: "Résilience",
    scenarios: [
      "controlled_failure"
    ],
    minimumValidRunsPerScenario: 3,
    criteria: [
      {
        id: "H1-C3",
        metric: "mttr_seconds",
        operator: "<=",
        threshold: 30,
        unit: "s",
        aggregation: "median",
        required: true,
        scenarios: [
          "controlled_failure"
        ]
      }
    ]
  };

  const runs = [
    {
      runId: "failure-001",
      scenario: "controlled_failure",
      hypothesisIds: [
        "H1"
      ],
      status: "COMPLETED",
      metrics: {
        mttr_seconds: 18
      }
    }
  ];

  const evaluation = evaluateHypothesis(
    hypothesis,
    runs
  );

  assert.equal(
    evaluation.verdict,
    "INDETERMINATE"
  );

  assert.equal(
    evaluation.criteriaResults[0].status,
    "NOT_MEASURED"
  );

  assert.equal(
    evaluation.scenarioCoverage.controlled_failure.validRuns,
    1
  );

  assert.equal(
    evaluation.scenarioCoverage.controlled_failure.sufficient,
    false
  );
});


test("evaluateHypothesis valide trois exécutions conformes", () => {
  const hypothesis = {
    id: "H1",
    title: "Résilience",
    scenarios: [
      "controlled_failure"
    ],
    minimumValidRunsPerScenario: 3,
    criteria: [
      {
        id: "H1-C3",
        metric: "mttr_seconds",
        operator: "<=",
        threshold: 30,
        unit: "s",
        aggregation: "median",
        required: true,
        scenarios: [
          "controlled_failure"
        ]
      }
    ]
  };

  const runs = [17, 18, 19].map(
    (mttr, index) => ({
      runId: `failure-00${index + 1}`,
      scenario: "controlled_failure",
      hypothesisIds: [
        "H1"
      ],
      status: "COMPLETED",
      validity: {
        isValid: true
      },
      startedAt:
        `2026-06-21T12:0${index}:00Z`,
      metrics: {
        mttr_seconds: mttr
      }
    })
  );

  const evaluation = evaluateHypothesis(
    hypothesis,
    runs
  );

  assert.equal(
    evaluation.verdict,
    "VALIDATED"
  );

  assert.equal(
    evaluation.criteriaResults[0].observed,
    18
  );

  assert.equal(
    evaluation.criteriaResults[0].sampleSize,
    3
  );

  assert.equal(
    evaluation.scenarioCoverage.controlled_failure.sufficient,
    true
  );
});


test("evaluateHypothesis rejette trois exécutions non conformes", () => {
  const hypothesis = {
    id: "H1",
    title: "Résilience",
    scenarios: [
      "controlled_failure"
    ],
    minimumValidRunsPerScenario: 3,
    criteria: [
      {
        id: "H1-C3",
        metric: "mttr_seconds",
        operator: "<=",
        threshold: 30,
        unit: "s",
        aggregation: "median",
        required: true,
        scenarios: [
          "controlled_failure"
        ]
      }
    ]
  };

  const runs = [35, 40, 45].map(
    (mttr, index) => ({
      runId: `failure-rejected-00${index + 1}`,
      scenario: "controlled_failure",
      hypothesisIds: [
        "H1"
      ],
      status: "COMPLETED",
      validity: {
        isValid: true
      },
      metrics: {
        mttr_seconds: mttr
      }
    })
  );

  const evaluation = evaluateHypothesis(
    hypothesis,
    runs
  );

  assert.equal(
    evaluation.verdict,
    "REJECTED"
  );

  assert.equal(
    evaluation.criteriaResults[0].observed,
    40
  );

  assert.equal(
    evaluation.criteriaResults[0].status,
    "REJECTED"
  );
});
