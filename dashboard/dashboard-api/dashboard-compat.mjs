function arrayOrEmpty(value) {
  return Array.isArray(value)
    ? value
    : [];
}


function normalizeVerdict(value) {
  return String(
    value ?? "INDETERMINATE"
  ).toUpperCase();
}


function getRunEvaluation(runEntry) {
  return (
    runEntry?.evaluation ??
    runEntry ??
    {}
  );
}


export function summarizeDashboardModel(model) {
  const runs = arrayOrEmpty(
    model?.runs
  );

  const summary = {
    total:
      Number(
        model?.index?.totalRunsEvaluated
      ) || runs.length,

    validated: 0,
    rejected: 0,
    measured: 0,
    indeterminate: 0
  };

  for (const runEntry of runs) {
    const evaluation =
      getRunEvaluation(runEntry);

    const verdict =
      normalizeVerdict(
        evaluation.verdict ??
        runEntry?.verdict
      );

    if (verdict === "VALIDATED") {
      summary.validated += 1;
    } else if (
      verdict === "REJECTED"
    ) {
      summary.rejected += 1;
    } else {
      summary.indeterminate += 1;
      summary.measured += 1;
    }
  }

  return summary;
}


export function buildHypothesesSummary(
  model
) {
  return Object.fromEntries(
    ["H1", "H2"].map(
      (hypothesisId) => {
        const evaluation =
          model?.hypotheses?.[
            hypothesisId
          ] ?? null;

        return [
          hypothesisId,
          evaluation
            ? {
                hypothesisId,
                title:
                  evaluation.title ??
                  hypothesisId,

                verdict:
                  normalizeVerdict(
                    evaluation.verdict
                  ),

                totalRunsFound:
                  evaluation.totalRunsFound ??
                  0,

                totalValidRuns:
                  evaluation.totalValidRuns ??
                  0,

                minimumValidRunsPerScenario:
                  evaluation.minimumValidRunsPerScenario ??
                  3,

                scenarioCoverage:
                  evaluation.scenarioCoverage ??
                  {},

                criteriaResults:
                  arrayOrEmpty(
                    evaluation.criteriaResults
                  )
              }
            : null
        ];
      }
    )
  );
}


export function buildOverviewResponse({
  model,
  namespace,
  services = []
}) {
  const summary =
    summarizeDashboardModel(
      model
    );

  return {
    platform:
      "Smart Grid DevOps Platform",

    namespace,

    timestamp:
      new Date().toISOString(),

    storageMode:
      "filesystem",

    actionsEnabled:
      false,

    services:
      arrayOrEmpty(services),

    experiments:
      summary,

    history: {
      experimentResults:
        arrayOrEmpty(
          model?.runs
        ).length,

      kubernetesSnapshots: 0,
      dashboardActions: 0,
      storageMode:
        "filesystem"
    },

    hypotheses:
      buildHypothesesSummary(
        model
      ),

    reportsHealth:
      model?.reportsHealth ?? null
  };
}


export function buildExperimentsResponse(
  model
) {
  const reports =
    arrayOrEmpty(
      model?.rawExperiments
    );

  return {
    count:
      reports.length,

    summary:
      summarizeDashboardModel(
        model
      ),

    reports,

    evaluations:
      arrayOrEmpty(
        model?.runs
      ),

    hypotheses:
      buildHypothesesSummary(
        model
      ),

    timestamp:
      new Date().toISOString()
  };
}


export function buildLegacyHistoryRows(
  model
) {
  const rows = [];
  let identifier = 1;

  for (
    const runEntry
    of arrayOrEmpty(model?.runs)
  ) {
    const evaluation =
      getRunEvaluation(
        runEntry
      );

    const criteriaResults =
      arrayOrEmpty(
        evaluation.criteriaResults
      );

    const sourceFile =
      evaluation.sourceFile ??
      runEntry.sourceFile ??
      runEntry.evaluationFile ??
      null;

    const scenario =
      evaluation.scenario ??
      runEntry.scenario ??
      "unknown";

    const timestamp =
      evaluation.evaluatedAt ??
      evaluation.endedAt ??
      evaluation.startedAt ??
      model?.generatedAt ??
      null;

    if (
      criteriaResults.length === 0
    ) {
      rows.push({
        id:
          identifier++,

        run_id:
          evaluation.runId ??
          runEntry.runId ??
          null,

        source_file:
          sourceFile,

        scenario,

        metric_name:
          null,

        value:
          null,

        unit:
          null,

        threshold:
          null,

        status:
          normalizeVerdict(
            evaluation.verdict ??
            runEntry.verdict
          ),

        timestamp,

        raw_json:
          JSON.stringify(
            evaluation
          )
      });

      continue;
    }

    for (
      const criterion
      of criteriaResults
    ) {
      rows.push({
        id:
          identifier++,

        run_id:
          evaluation.runId ??
          runEntry.runId ??
          null,

        source_file:
          sourceFile,

        scenario,

        hypothesis_id:
          criterion.hypothesisId ??
          null,

        criterion_id:
          criterion.criterionId ??
          null,

        metric_name:
          criterion.metric ??
          null,

        value:
          criterion.observed ??
          null,

        unit:
          criterion.unit ??
          null,

        threshold:
          criterion.threshold ??
          null,

        operator:
          criterion.operator ??
          null,

        status:
          criterion.status ??
          "NOT_MEASURED",

        timestamp,

        raw_json:
          JSON.stringify(
            criterion
          )
      });
    }
  }

  return rows;
}


export function buildHistoryExperimentsResponse(
  model
) {
  const results =
    buildLegacyHistoryRows(
      model
    );

  return {
    count:
      results.length,

    storageMode:
      "filesystem",

    deprecatedSQLite:
      true,

    results,

    timestamp:
      new Date().toISOString()
  };
}


export function buildEmptyHistoryResponse(
  kind
) {
  const property =
    kind === "actions"
      ? "actions"
      : "snapshots";

  return {
    count: 0,

    storageMode:
      "filesystem",

    deprecatedSQLite:
      true,

    readOnly:
      true,

    reason:
      kind === "actions"
        ? "Les actions du Dashboard sont désactivées pendant la migration scientifique."
        : "Les snapshots SQLite sont remplacés par les fichiers de preuve expérimentale.",

    [property]: [],

    timestamp:
      new Date().toISOString()
  };
}


export function buildEvaluationsResponse(
  model
) {
  return {
    schemaVersion:
      model?.index?.schemaVersion ??
      "1.0",

    generatedAt:
      model?.index?.generatedAt ??
      model?.generatedAt ??
      null,

    totalRunsEvaluated:
      model?.index?.totalRunsEvaluated ??
      0,

    runs:
      arrayOrEmpty(
        model?.runs
      ),

    hypotheses:
      buildHypothesesSummary(
        model
      ),

    reportsHealth:
      model?.reportsHealth ??
      null
  };
}


export function buildHypothesisResponse(
  model,
  hypothesisId
) {
  const normalizedId =
    String(hypothesisId)
      .toUpperCase();

  if (
    !["H1", "H2"].includes(
      normalizedId
    )
  ) {
    throw new Error(
      `Hypothèse inconnue : ${hypothesisId}`
    );
  }

  const evaluation =
    model?.hypotheses?.[
      normalizedId
    ];

  if (!evaluation) {
    return null;
  }

  return evaluation;
}


export function buildReadOnlyActionResponse(
  action
) {
  return {
    status:
      "DISABLED",

    readOnly:
      true,

    action,

    message:
      "Cette action est temporairement désactivée. Les expérimentations doivent être exécutées par les scripts contrôlés afin de produire des result.json conformes.",

    timestamp:
      new Date().toISOString()
  };
}
