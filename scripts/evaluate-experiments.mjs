#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from "node:fs";

import {
  basename,
  dirname,
  join,
  relative,
  resolve
} from "node:path";

import {
  evaluateHypothesis,
  evaluateRun
} from "../shared/evaluation/evaluator.mjs";


const PROJECT_ROOT = process.cwd();

const EXPERIMENTS_DIRECTORY = resolve(
  PROJECT_ROOT,
  "reports/experiments"
);

const EVALUATIONS_DIRECTORY = resolve(
  PROJECT_ROOT,
  "reports/evaluations"
);

const RUN_EVALUATIONS_DIRECTORY = join(
  EVALUATIONS_DIRECTORY,
  "runs"
);


function readJson(filePath) {
  try {
    return JSON.parse(
      readFileSync(filePath, "utf8")
    );
  } catch (error) {
    throw new Error(
      `Lecture JSON impossible pour ${filePath} : ${error.message}`
    );
  }
}


function writeJsonAtomic(filePath, data) {
  mkdirSync(dirname(filePath), {
    recursive: true
  });

  const temporaryPath = `${filePath}.tmp`;

  writeFileSync(
    temporaryPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );

  renameSync(
    temporaryPath,
    filePath
  );
}


function writeTextAtomic(filePath, content) {
  mkdirSync(dirname(filePath), {
    recursive: true
  });

  const temporaryPath = `${filePath}.tmp`;

  writeFileSync(
    temporaryPath,
    content,
    "utf8"
  );

  renameSync(
    temporaryPath,
    filePath
  );
}


function findResultFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const resultFiles = [];

  for (
    const entry
    of readdirSync(directory, {
      withFileTypes: true
    })
  ) {
    const fullPath = join(
      directory,
      entry.name
    );

    if (entry.isDirectory()) {
      resultFiles.push(
        ...findResultFiles(fullPath)
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name === "result.json"
    ) {
      resultFiles.push(fullPath);
    }
  }

  return resultFiles.sort();
}


function loadHypotheses() {
  return {
    H1: readJson(
      resolve(
        PROJECT_ROOT,
        "reports/hypotheses/H1.json"
      )
    ),

    H2: readJson(
      resolve(
        PROJECT_ROOT,
        "reports/hypotheses/H2.json"
      )
    )
  };
}


function loadExperimentEntries() {
  return findResultFiles(
    EXPERIMENTS_DIRECTORY
  ).map((filePath) => ({
    filePath,
    run: readJson(filePath)
  }));
}


function sanitizeIdentifier(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


function getRunIdentifier(run, sourcePath) {
  const identifier =
    run.runId ??
    run.id ??
    basename(dirname(sourcePath));

  const sanitized = sanitizeIdentifier(
    identifier
  );

  if (!sanitized) {
    throw new Error(
      `Identifiant d'exécution invalide pour ${sourcePath}.`
    );
  }

  return sanitized;
}


function validateMinimumRunFields(run, sourcePath) {
  const missingFields = [];

  if (!run.scenario) {
    missingFields.push("scenario");
  }

  if (
    !Array.isArray(run.hypothesisIds) ||
    run.hypothesisIds.length === 0
  ) {
    missingFields.push("hypothesisIds");
  }

  if (!run.status) {
    missingFields.push("status");
  }

  if (
    run.metrics === null ||
    typeof run.metrics !== "object" ||
    Array.isArray(run.metrics)
  ) {
    missingFields.push("metrics");
  }

  if (missingFields.length > 0) {
    throw new Error(
      `Résultat incomplet dans ${sourcePath}. ` +
      `Champs manquants ou invalides : ` +
      `${missingFields.join(", ")}.`
    );
  }
}


function createHypothesisMarkdown(evaluation) {
  const lines = [
    `# Évaluation de l'hypothèse ${evaluation.hypothesisId}`,
    "",
    `**Titre :** ${evaluation.title ?? evaluation.hypothesisId}`,
    "",
    `**Verdict :** ${evaluation.verdict}`,
    "",
    `**Date d'évaluation :** ${evaluation.evaluatedAt}`,
    "",
    `**Exécutions trouvées :** ${evaluation.totalRunsFound}`,
    "",
    `**Exécutions valides :** ${evaluation.totalValidRuns}`,
    "",
    `**Minimum requis par scénario :** ` +
      `${evaluation.minimumValidRunsPerScenario}`,
    "",
    "## Couverture des scénarios",
    "",
    "| Scénario | Exécutions valides | Minimum requis | Suffisant |",
    "|---|---:|---:|---|"
  ];

  for (
    const [scenario, coverage]
    of Object.entries(
      evaluation.scenarioCoverage
    )
  ) {
    lines.push(
      `| ${scenario} | ` +
      `${coverage.validRuns} | ` +
      `${coverage.requiredRuns} | ` +
      `${coverage.sufficient ? "Oui" : "Non"} |`
    );
  }

  lines.push(
    "",
    "## Évaluation des critères",
    "",
    "| Critère | Métrique | Agrégation | Valeur observée | Seuil | Échantillon | Statut |",
    "|---|---|---|---:|---|---:|---|"
  );

  for (
    const result
    of evaluation.criteriaResults
  ) {
    const observed =
      result.observed === null ||
      result.observed === undefined
        ? "Non mesurée"
        : String(result.observed);

    const aggregation =
      result.aggregation ?? "Aucune";

    const unit =
      result.unit ?? "";

    lines.push(
      `| ${result.criterionId} | ` +
      `${result.metric} | ` +
      `${aggregation} | ` +
      `${observed} | ` +
      `${result.operator} ${result.threshold} ${unit} | ` +
      `${result.sampleSize} | ` +
      `${result.status} |`
    );
  }

  lines.push("");

  if (evaluation.verdict === "INDETERMINATE") {
    lines.push(
      "Le verdict demeure indéterminé car toutes les mesures " +
      "ou répétitions minimales ne sont pas encore disponibles.",
      ""
    );
  }

  return `${lines.join("\n")}\n`;
}


function createRunMarkdown(evaluation) {
  const lines = [
    `# Évaluation de l'exécution ${evaluation.runId ?? evaluation.id}`,
    "",
    `**Scénario :** ${evaluation.scenario}`,
    "",
    `**Statut technique :** ${evaluation.status}`,
    "",
    `**Verdict de l'exécution :** ${evaluation.verdict}`,
    "",
    `**Date d'évaluation :** ${evaluation.evaluatedAt}`,
    "",
    `**Fichier source :** ${evaluation.sourceFile}`,
    "",
    "## Critères",
    "",
    "| Hypothèse | Critère | Métrique | Valeur | Seuil | Statut |",
    "|---|---|---|---:|---|---|"
  ];

  for (
    const result
    of evaluation.criteriaResults
  ) {
    const observed =
      result.observed === null ||
      result.observed === undefined
        ? "Non mesurée"
        : String(result.observed);

    lines.push(
      `| ${result.hypothesisId} | ` +
      `${result.criterionId} | ` +
      `${result.metric} | ` +
      `${observed} | ` +
      `${result.operator} ${result.threshold} ${result.unit ?? ""} | ` +
      `${result.status} |`
    );
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}


function evaluateExperimentEntry(
  entry,
  hypotheses
) {
  validateMinimumRunFields(
    entry.run,
    entry.filePath
  );

  const runIdentifier = getRunIdentifier(
    entry.run,
    entry.filePath
  );

  const evaluated = evaluateRun(
    entry.run,
    hypotheses
  );

  const sourceFile = relative(
    PROJECT_ROOT,
    entry.filePath
  );

  const completeEvaluation = {
    ...evaluated,
    runId: evaluated.runId ?? runIdentifier,
    sourceFile
  };

  const jsonOutputPath = join(
    RUN_EVALUATIONS_DIRECTORY,
    `${runIdentifier}-evaluation.json`
  );

  const markdownOutputPath = join(
    RUN_EVALUATIONS_DIRECTORY,
    `${runIdentifier}-evaluation.md`
  );

  writeJsonAtomic(
    jsonOutputPath,
    completeEvaluation
  );

  writeTextAtomic(
    markdownOutputPath,
    createRunMarkdown(
      completeEvaluation
    )
  );

  return {
    runIdentifier,
    evaluation: completeEvaluation,
    jsonOutputPath,
    markdownOutputPath
  };
}


function evaluateAndWriteHypothesis(
  hypothesis,
  runs
) {
  const evaluation = evaluateHypothesis(
    hypothesis,
    runs
  );

  const jsonPath = join(
    EVALUATIONS_DIRECTORY,
    `${hypothesis.id}-evaluation.json`
  );

  const markdownPath = join(
    EVALUATIONS_DIRECTORY,
    `${hypothesis.id}-evaluation.md`
  );

  writeJsonAtomic(
    jsonPath,
    evaluation
  );

  writeTextAtomic(
    markdownPath,
    createHypothesisMarkdown(
      evaluation
    )
  );

  return {
    evaluation,
    jsonPath,
    markdownPath
  };
}


function createEvaluationIndex({
  runOutputs,
  hypothesisOutputs
}) {
  const index = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),

    experimentResultsDirectory: relative(
      PROJECT_ROOT,
      EXPERIMENTS_DIRECTORY
    ),

    totalRunsEvaluated: runOutputs.length,

    runs: runOutputs.map((output) => ({
      runId:
        output.evaluation.runId ??
        output.runIdentifier,

      scenario:
        output.evaluation.scenario,

      status:
        output.evaluation.status,

      verdict:
        output.evaluation.verdict,

      sourceFile:
        output.evaluation.sourceFile,

      evaluationFile: relative(
        PROJECT_ROOT,
        output.jsonOutputPath
      )
    })),

    hypotheses: Object.fromEntries(
      hypothesisOutputs.map((output) => [
        output.evaluation.hypothesisId,
        {
          verdict:
            output.evaluation.verdict,

          totalRunsFound:
            output.evaluation.totalRunsFound,

          totalValidRuns:
            output.evaluation.totalValidRuns,

          evaluationFile: relative(
            PROJECT_ROOT,
            output.jsonPath
          ),

          markdownFile: relative(
            PROJECT_ROOT,
            output.markdownPath
          )
        }
      ])
    )
  };

  writeJsonAtomic(
    join(
      EVALUATIONS_DIRECTORY,
      "index.json"
    ),
    index
  );

  return index;
}


function evaluateAll() {
  const hypotheses = loadHypotheses();
  const experimentEntries =
    loadExperimentEntries();

  const runOutputs =
    experimentEntries.map((entry) =>
      evaluateExperimentEntry(
        entry,
        hypotheses
      )
    );

  const rawRuns =
    experimentEntries.map(
      (entry) => entry.run
    );

  const hypothesisOutputs = [
    evaluateAndWriteHypothesis(
      hypotheses.H1,
      rawRuns
    ),

    evaluateAndWriteHypothesis(
      hypotheses.H2,
      rawRuns
    )
  ];

  const index = createEvaluationIndex({
    runOutputs,
    hypothesisOutputs
  });

  console.log(
    `${index.totalRunsEvaluated} résultat(s) ` +
    "d'expérience évalué(s)."
  );

  for (
    const output
    of hypothesisOutputs
  ) {
    console.log(
      `${output.evaluation.hypothesisId}: ` +
      `${output.evaluation.verdict}`
    );
  }
}


function evaluateSingleRun(filePathArgument) {
  const hypotheses = loadHypotheses();

  const filePath = resolve(
    PROJECT_ROOT,
    filePathArgument
  );

  if (!existsSync(filePath)) {
    throw new Error(
      `Fichier introuvable : ${filePath}`
    );
  }

  const output = evaluateExperimentEntry(
    {
      filePath,
      run: readJson(filePath)
    },
    hypotheses
  );

  console.log(
    `${output.evaluation.runId}: ` +
    `${output.evaluation.verdict}`
  );

  console.log(
    `Évaluation : ${relative(
      PROJECT_ROOT,
      output.jsonOutputPath
    )}`
  );
}


function evaluateSingleHypothesis(
  hypothesisId
) {
  const hypotheses = loadHypotheses();

  const hypothesis =
    hypotheses[hypothesisId];

  if (!hypothesis) {
    throw new Error(
      `Hypothèse inconnue : ${hypothesisId}`
    );
  }

  const runs = loadExperimentEntries()
    .map((entry) => entry.run);

  const output = evaluateAndWriteHypothesis(
    hypothesis,
    runs
  );

  console.log(
    `${hypothesisId}: ` +
    `${output.evaluation.verdict}`
  );
}


function printUsage() {
  console.log(
    "Utilisation :\n" +
    "  node scripts/evaluate-experiments.mjs all\n" +
    "  node scripts/evaluate-experiments.mjs run <result.json>\n" +
    "  node scripts/evaluate-experiments.mjs hypothesis H1\n" +
    "  node scripts/evaluate-experiments.mjs hypothesis H2"
  );
}


const [
  command,
  argument
] = process.argv.slice(2);


try {
  switch (command) {
    case "all":
      evaluateAll();
      break;

    case "run":
      if (!argument) {
        throw new Error(
          "Le chemin du fichier result.json est obligatoire."
        );
      }

      evaluateSingleRun(argument);
      break;

    case "hypothesis":
      if (!argument) {
        throw new Error(
          "L'identifiant H1 ou H2 est obligatoire."
        );
      }

      evaluateSingleHypothesis(
        argument.toUpperCase()
      );
      break;

    case "help":
    case "--help":
    case "-h":
      printUsage();
      break;

    default:
      printUsage();
      process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `ERREUR : ${error.message}`
  );

  process.exitCode = 1;
}
