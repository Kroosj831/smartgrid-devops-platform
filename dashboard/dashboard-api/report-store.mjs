import {
  existsSync,
  readFileSync,
  readdirSync
} from "node:fs";

import {
  basename,
  join,
  relative,
  resolve,
  sep
} from "node:path";


function normalizeReference(reference) {
  return String(reference ?? "")
    .trim()
    .replaceAll("\\", "/");
}


function readJsonFile(filePath) {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(
      readFileSync(filePath, "utf8")
    );
  } catch (error) {
    throw new Error(
      `JSON invalide dans ${filePath} : ${error.message}`
    );
  }
}


function findFilesRecursively(directory, predicate) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];

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
      files.push(
        ...findFilesRecursively(
          fullPath,
          predicate
        )
      );

      continue;
    }

    if (
      entry.isFile() &&
      predicate(fullPath, entry.name)
    ) {
      files.push(fullPath);
    }
  }

  return files.sort();
}


export function createReportStore({
  reportsDir
} = {}) {
  if (!reportsDir) {
    throw new Error(
      "reportsDir est obligatoire."
    );
  }

  const root = resolve(reportsDir);

  function assertInsideRoot(filePath) {
    const absolutePath = resolve(filePath);

    if (
      absolutePath !== root &&
      !absolutePath.startsWith(
        `${root}${sep}`
      )
    ) {
      throw new Error(
        `Chemin hors du dossier reports : ${filePath}`
      );
    }

    return absolutePath;
  }


  function resolveReference(reference) {
    const normalized =
      normalizeReference(reference);

    if (!normalized) {
      throw new Error(
        "Référence de rapport vide."
      );
    }

    const relativeReference =
      normalized.startsWith("reports/")
        ? normalized.slice(
            "reports/".length
          )
        : normalized;

    return assertInsideRoot(
      resolve(
        root,
        relativeReference
      )
    );
  }


  function loadEvaluationIndex() {
    const filePath = resolve(
      root,
      "evaluations",
      "index.json"
    );

    return readJsonFile(filePath);
  }


  function loadReferencedJson(reference) {
    return readJsonFile(
      resolveReference(reference)
    );
  }


  function loadHypothesisEvaluation(
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

    const index =
      loadEvaluationIndex();

    const reference =
      index?.hypotheses?.[
        normalizedId
      ]?.evaluationFile;

    if (reference) {
      return loadReferencedJson(
        reference
      );
    }

    return readJsonFile(
      resolve(
        root,
        "evaluations",
        `${normalizedId}-evaluation.json`
      )
    );
  }


  function loadRunEvaluations() {
    const index =
      loadEvaluationIndex();

    const indexedRuns =
      index?.runs ?? [];

    return indexedRuns.map(
      (runEntry) => {
        const evaluation =
          runEntry.evaluationFile
            ? loadReferencedJson(
                runEntry.evaluationFile
              )
            : null;

        return {
          ...runEntry,
          evaluation
        };
      }
    );
  }


  function loadRawExperimentResults() {
    const experimentsDirectory =
      resolve(
        root,
        "experiments"
      );

    const files =
      findFilesRecursively(
        experimentsDirectory,
        (
          filePath,
          fileName
        ) => fileName === "result.json"
      );

    return files.map(
      (filePath) => ({
        file: relative(
          root,
          filePath
        ).replaceAll("\\", "/"),

        runId:
          basename(
            resolve(
              filePath,
              ".."
            )
          ),

        data: readJsonFile(
          filePath
        )
      })
    );
  }


  function getHealth() {
    const indexPath = resolve(
      root,
      "evaluations",
      "index.json"
    );

    const h1Path = resolve(
      root,
      "evaluations",
      "H1-evaluation.json"
    );

    const h2Path = resolve(
      root,
      "evaluations",
      "H2-evaluation.json"
    );

    return {
      storageMode: "filesystem",
      reportsDirectory: root,
      evaluationIndexAvailable:
        existsSync(indexPath),
      h1EvaluationAvailable:
        existsSync(h1Path),
      h2EvaluationAvailable:
        existsSync(h2Path)
    };
  }


  function loadDashboardModel() {
    const index =
      loadEvaluationIndex();

    return {
      generatedAt:
        new Date().toISOString(),

      storageMode:
        "filesystem",

      reportsHealth:
        getHealth(),

      index,

      hypotheses: {
        H1:
          loadHypothesisEvaluation(
            "H1"
          ),

        H2:
          loadHypothesisEvaluation(
            "H2"
          )
      },

      runs:
        loadRunEvaluations(),

      rawExperiments:
        loadRawExperimentResults()
    };
  }


  return {
    root,
    resolveReference,
    loadEvaluationIndex,
    loadReferencedJson,
    loadHypothesisEvaluation,
    loadRunEvaluations,
    loadRawExperimentResults,
    loadDashboardModel,
    getHealth
  };
}
