import assert from "node:assert/strict";
import test from "node:test";

import {
  readFileSync
} from "node:fs";


const source = readFileSync(
  "dashboard/dashboard-frontend/src/main.js",
  "utf8"
);


test(
  "utilise la version Vue avec compilateur de templates",
  () => {
    assert.match(
      source,
      /vue\/dist\/vue\.esm-bundler\.js/
    );

    assert.match(
      source,
      /template:\s*`/
    );

    assert.match(
      source,
      /\.mount\(["']#app["']\)/
    );
  }
);
