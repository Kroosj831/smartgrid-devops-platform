function isMissing(value) {
  return value === undefined || value === null;
}

function requireFiniteNumber(value, label) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(
      `${label} doit être une valeur numérique finie.`
    );
  }

  return number;
}

export function compareValues(observed, operator, threshold) {
  if (isMissing(observed)) {
    return false;
  }

  switch (operator) {
    case "<":
      return (
        requireFiniteNumber(observed, "observed") <
        requireFiniteNumber(threshold, "threshold")
      );

    case "<=":
      return (
        requireFiniteNumber(observed, "observed") <=
        requireFiniteNumber(threshold, "threshold")
      );

    case ">":
      return (
        requireFiniteNumber(observed, "observed") >
        requireFiniteNumber(threshold, "threshold")
      );

    case ">=":
      return (
        requireFiniteNumber(observed, "observed") >=
        requireFiniteNumber(threshold, "threshold")
      );

    case "==":
      return observed === threshold;

    case "!=":
      return observed !== threshold;

    default:
      throw new Error(
        `Opérateur non pris en charge : ${operator}`
      );
  }
}

function toNumericValues(values) {
  return values.map((value) =>
    requireFiniteNumber(value, "valeur agrégée")
  );
}

export function aggregateValues(values, aggregation) {
  const cleanValues = values.filter(
    (value) => !isMissing(value)
  );

  if (cleanValues.length === 0) {
    return null;
  }

  switch (aggregation) {
    case "median": {
      const sorted = toNumericValues(cleanValues)
        .sort((a, b) => a - b);

      const middle = Math.floor(sorted.length / 2);

      if (sorted.length % 2 === 0) {
        return (
          sorted[middle - 1] + sorted[middle]
        ) / 2;
      }

      return sorted[middle];
    }

    case "mean":
    case "rate": {
      const numbers = toNumericValues(cleanValues);

      return (
        numbers.reduce(
          (sum, value) => sum + value,
          0
        ) / numbers.length
      );
    }

    case "min":
      return Math.min(...toNumericValues(cleanValues));

    case "max":
      return Math.max(...toNumericValues(cleanValues));

    case "latest":
      return cleanValues.at(-1);

    case "all":
      return cleanValues.every(
        (value) => value === true
      );

    default:
      throw new Error(
        `Agrégation non prise en charge : ${aggregation}`
      );
  }
}

export function isValidRun(run) {
  return (
    run.status === "COMPLETED" &&
    run.validity?.isValid !== false
  );
}

function appliesToScenario(criterion, scenario) {
  if (!Array.isArray(criterion.scenarios)) {
    return true;
  }

  return criterion.scenarios.includes(scenario);
}

function createCriterionResult({
  hypothesisId,
  criterion,
  observed,
  status,
  aggregation = null,
  sampleSize = 1,
  scenarios = [],
  insufficientScenarios = []
}) {
  return {
    hypothesisId,
    criterionId: criterion.id,
    metric: criterion.metric,
    operator: criterion.operator,
    threshold: criterion.threshold,
    unit: criterion.unit ?? null,
    observed,
    aggregation,
    sampleSize,
    scenarios,
    required: criterion.required !== false,
    insufficientScenarios,
    status
  };
}

export function calculateVerdict(criteriaResults) {
  const requiredResults = criteriaResults.filter(
    (result) => result.required !== false
  );

  if (requiredResults.length === 0) {
    return "INDETERMINATE";
  }

  if (
    requiredResults.some(
      (result) => result.status === "REJECTED"
    )
  ) {
    return "REJECTED";
  }

  if (
    requiredResults.some(
      (result) => result.status === "NOT_MEASURED"
    )
  ) {
    return "INDETERMINATE";
  }

  return "VALIDATED";
}

export function evaluateRun(run, hypothesisDefinitions) {
  const criteriaResults = [];

  for (const hypothesisId of run.hypothesisIds ?? []) {
    const hypothesis = hypothesisDefinitions[hypothesisId];

    if (!hypothesis) {
      throw new Error(
        `Définition absente pour ${hypothesisId}.`
      );
    }

    const applicableCriteria = hypothesis.criteria.filter(
      (criterion) =>
        appliesToScenario(criterion, run.scenario)
    );

    for (const criterion of applicableCriteria) {
      const observed = run.metrics?.[criterion.metric];

      if (isMissing(observed)) {
        criteriaResults.push(
          createCriterionResult({
            hypothesisId,
            criterion,
            observed: null,
            status: "NOT_MEASURED",
            scenarios: [run.scenario]
          })
        );

        continue;
      }

      const passed = compareValues(
        observed,
        criterion.operator,
        criterion.threshold
      );

      criteriaResults.push(
        createCriterionResult({
          hypothesisId,
          criterion,
          observed,
          status: passed ? "PASSED" : "REJECTED",
          scenarios: [run.scenario]
        })
      );
    }
  }

  return {
    ...run,
    criteriaResults,
    verdict: calculateVerdict(criteriaResults),
    evaluatedAt: new Date().toISOString()
  };
}

function runTimestamp(run) {
  const rawTimestamp =
    run.endedAt ??
    run.startedAt ??
    "1970-01-01T00:00:00.000Z";

  const timestamp = Date.parse(rawTimestamp);

  return Number.isFinite(timestamp)
    ? timestamp
    : 0;
}

function countRunsByScenario(validRuns, scenarios) {
  return Object.fromEntries(
    scenarios.map((scenario) => [
      scenario,
      validRuns.filter(
        (run) => run.scenario === scenario
      ).length
    ])
  );
}

export function evaluateHypothesis(hypothesis, allRuns) {
  const hypothesisRuns = allRuns
    .filter((run) =>
      (run.hypothesisIds ?? []).includes(hypothesis.id)
    )
    .filter((run) =>
      hypothesis.scenarios.includes(run.scenario)
    )
    .sort(
      (left, right) =>
        runTimestamp(left) - runTimestamp(right)
    );

  const validRuns = hypothesisRuns.filter(isValidRun);

  const validRunsByScenario = countRunsByScenario(
    validRuns,
    hypothesis.scenarios
  );

  const minimumRuns =
    hypothesis.minimumValidRunsPerScenario ?? 1;

  const criteriaResults = hypothesis.criteria.map(
    (criterion) => {
      const criterionScenarios =
        criterion.scenarios ?? hypothesis.scenarios;

      const insufficientScenarios =
        criterionScenarios.filter(
          (scenario) =>
            (validRunsByScenario[scenario] ?? 0) <
            minimumRuns
        );

      const matchingRuns = validRuns.filter((run) =>
        criterionScenarios.includes(run.scenario)
      );

      const values = matchingRuns
        .map((run) => run.metrics?.[criterion.metric])
        .filter((value) => !isMissing(value));

      if (
        insufficientScenarios.length > 0 ||
        values.length === 0
      ) {
        return createCriterionResult({
          hypothesisId: hypothesis.id,
          criterion,
          observed: null,
          status: "NOT_MEASURED",
          aggregation: criterion.aggregation ?? null,
          sampleSize: values.length,
          scenarios: criterionScenarios,
          insufficientScenarios
        });
      }

      const observed = aggregateValues(
        values,
        criterion.aggregation
      );

      const passed = compareValues(
        observed,
        criterion.operator,
        criterion.threshold
      );

      return createCriterionResult({
        hypothesisId: hypothesis.id,
        criterion,
        observed,
        status: passed ? "PASSED" : "REJECTED",
        aggregation: criterion.aggregation ?? null,
        sampleSize: values.length,
        scenarios: criterionScenarios
      });
    }
  );

  const scenarioCoverage = Object.fromEntries(
    hypothesis.scenarios.map((scenario) => {
      const validRuns =
        validRunsByScenario[scenario] ?? 0;

      return [
        scenario,
        {
          validRuns,
          requiredRuns: minimumRuns,
          sufficient: validRuns >= minimumRuns
        }
      ];
    })
  );

  return {
    schemaVersion: "1.0",
    hypothesisId: hypothesis.id,
    title: hypothesis.title,
    evaluatedAt: new Date().toISOString(),
    minimumValidRunsPerScenario: minimumRuns,
    totalRunsFound: hypothesisRuns.length,
    totalValidRuns: validRuns.length,
    scenarioCoverage,
    criteriaResults,
    verdict: calculateVerdict(criteriaResults)
  };
}
