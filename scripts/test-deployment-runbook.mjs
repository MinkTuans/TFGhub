import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "indieforge-deploy-runbook-"));
const document = await readFile("docs/deployment.md", "utf8");
const block = (prefix) => {
  const value = [...document.matchAll(/```bash\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .find((candidate) => candidate.startsWith(prefix));
  assert.ok(value, `runbook must provide ${prefix}`);
  return value;
};
const backupBlock = block("backup_release() (");
const backupFunction = backupBlock.slice(
  0,
  backupBlock.lastIndexOf("\nbackup_release\n"),
);
const grantBlock = block("grant_moderator() {");
const grantFunction = grantBlock.slice(
  0,
  grantBlock.lastIndexOf("\ngrant_moderator\n"),
);
const lifecycle = join(directory, "lifecycle");
const backupHarness = `
git() { printf 'drill revision\\n'; }
compose() {
  case "$1" in
    ps)
      if [[ "$*" == *"--status running -q api" && "$DRILL_RUNNING" == *api* ]]; then printf 'api-id\\n'; fi
      if [[ "$*" == *"--status running -q web" && "$DRILL_RUNNING" == *web* ]]; then printf 'web-id\\n'; fi
      ;;
    stop) printf 'stop:%s\\n' "\${*:2}" >> "$DRILL_LIFECYCLE" ;;
    start) printf 'start:%s\\n' "\${*:2}" >> "$DRILL_LIFECYCLE" ;;
    up) printf 'up:%s\\n' "\${*:2}" >> "$DRILL_LIFECYCLE"; return 91 ;;
    exec)
      if [[ "$*" == *pg_dump* ]]; then printf 'drill database dump'; else return 0; fi
      ;;
    run) tar -czf - --files-from /dev/null ;;
    *) return 99 ;;
  esac
}
${backupFunction}
backup_release
`;

const invokeBackup = async (running) => {
  await writeFile(lifecycle, "");
  const result = spawnSync("bash", ["-c", backupHarness], {
    encoding: "utf8",
    cwd: directory,
    env: {
      ...process.env,
      DRILL_RUNNING: running,
      DRILL_LIFECYCLE: lifecycle,
    },
  });
  return { ...result, lifecycle: await readFile(lifecycle, "utf8") };
};

const dockerPrefix =
  spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0
    ? []
    : ["sudo"];
const docker = (args, options = {}) =>
  execFileSync(
    dockerPrefix[0] ?? "docker",
    [...(dockerPrefix.length ? ["docker"] : []), ...args],
    { encoding: "utf8", ...options },
  );
const container = `indieforge-grant-${process.pid}`;
const sql = (query) =>
  docker([
    "exec",
    container,
    "psql",
    "-U",
    "drill",
    "-d",
    "drill",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ], { stdio: "pipe" }).trim();

try {
  const apiOnly = await invokeBackup("api");
  assert.equal(apiOnly.status, 0, apiOnly.stderr);
  assert.equal(apiOnly.lifecycle, "stop:api\nstart:api\n");
  console.log("backup restores only initially running API: PASS");

  const stopped = await invokeBackup("");
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(stopped.lifecycle, "");
  console.log("backup preserves an already stopped service: PASS");

  docker([
    "run",
    "-d",
    "--pull=never",
    "--name",
    container,
    "-e",
    "POSTGRES_USER=drill",
    "-e",
    "POSTGRES_DB=drill",
    "-e",
    "POSTGRES_PASSWORD=grant-drill-only",
    "postgres:16-alpine",
  ]);
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      sql("SELECT 1");
      break;
    } catch {
      assert.ok(Date.now() < deadline, "disposable PostgreSQL startup timed out");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  sql('CREATE TABLE "User" (email text PRIMARY KEY, role text NOT NULL)');
  sql("INSERT INTO \"User\" VALUES ('operator@example.com', 'USER'), ('o''hara@example.com', 'USER')");

  const grantHarness = `
compose() {
  test "$1" = exec || return 99
  shift 3
  ${dockerPrefix.length ? "sudo " : ""}docker exec -i -e POSTGRES_USER=drill -e POSTGRES_DB=drill "$DRILL_CONTAINER" "$@"
}
${grantFunction}
grant_moderator
`;
  for (const email of ["operator@example.com", "o'hara@example.com"]) {
    const result = spawnSync("bash", ["-c", grantHarness], {
      input: `${email}\nGRANT\n`,
      encoding: "utf8",
      env: { ...process.env, DRILL_CONTAINER: container },
    });
    assert.equal(result.status, 0, result.stderr);
    const escaped = email.replaceAll("'", "''");
    assert.equal(
      sql(`SELECT role FROM "User" WHERE email = '${escaped}'`),
      "MODERATOR",
    );
  }
  console.log("moderator grants support ordinary and apostrophe emails: PASS");
} finally {
  try {
    docker(["rm", "-f", "-v", container]);
  } catch {
    // The backup tests run before the disposable PostgreSQL container exists.
  }
  await rm(directory, { recursive: true, force: true });
  console.log("cleanup: PASS (deployment runbook drill removed)");
}
