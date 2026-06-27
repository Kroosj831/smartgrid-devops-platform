import assert from "node:assert/strict";
import test from "node:test";

import {
  readFileSync
} from "node:fs";


const mainSource =
  readFileSync(
    "dashboard/dashboard-frontend/src/main.js",
    "utf8"
  );

const modelSource =
  readFileSync(
    "dashboard/dashboard-frontend/src/dashboard-model.mjs",
    "utf8"
  );

const styleSource =
  readFileSync(
    "dashboard/dashboard-frontend/src/style.css",
    "utf8"
  );

const indexSource =
  readFileSync(
    "dashboard/dashboard-frontend/index.html",
    "utf8"
  );

const packageJson =
  JSON.parse(
    readFileSync(
      "dashboard/dashboard-frontend/package.json",
      "utf8"
    )
  );


test(
  "utilise le modèle scientifique",
  () => {
    assert.match(
      mainSource,
      /loadDashboardData/
    );

    assert.match(
      mainSource,
      /dashboard-model\.mjs/
    );

    assert.match(
      mainSource,
      /Hypothèses H1 et H2/
    );
  }
);


test(
  "ne contient aucune action expérimentale",
  () => {
    const activeSources =
      `${mainSource}\n${modelSource}`;

    assert.doesNotMatch(
      activeSources,
      /\/api\/actions\//
    );

    assert.doesNotMatch(
      activeSources,
      /\/api\/history\//
    );

    assert.doesNotMatch(
      activeSources,
      /sqlite/i
    );

    assert.doesNotMatch(
      activeSources,
      /method\s*:\s*["']POST["']/
    );
  }
);


test(
  "charge uniquement les routes de lecture",
  () => {
    assert.match(
      modelSource,
      /\/dashboard\/health/
    );

    assert.match(
      modelSource,
      /\/api\/evaluations/
    );

    assert.match(
      modelSource,
      /\/api\/kubernetes\/deployments/
    );

    assert.match(
      modelSource,
      /\/api\/kubernetes\/pods/
    );

    assert.match(
      modelSource,
      /Promise\.allSettled/
    );
  }
);


test(
  "présente explicitement le mode lecture seule",
  () => {
    assert.match(
      mainSource,
      /Lecture seule/
    );

    assert.match(
      mainSource,
      /ne déclenche aucune expérimentation/
    );

    assert.match(
      mainSource,
      /ne modifie aucune ressource Kubernetes/
    );
  }
);


test(
  "conserve une entrée Vite valide",
  () => {
    assert.match(
      indexSource,
      /src\/main\.js/
    );

    assert.equal(
      packageJson.scripts?.build,
      "vite build"
    );

    assert.ok(
      packageJson.dependencies?.vue
    );

    assert.ok(
      packageJson.devDependencies?.vite
    );

    assert.match(
      styleSource,
      /\.hypothesis-card/
    );
  }
);
