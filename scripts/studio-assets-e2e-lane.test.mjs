import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the Task 19 browser lane is discoverable without provisioning services", () => {
  const result = spawnSync(
    "bash",
    ["scripts/run-studio-assets-e2e.sh", "--help"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /isolated PostgreSQL 16/i);
  assert.match(result.stdout, /studio-assets\.spec\.ts/);
});
