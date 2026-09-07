import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Execute the documented restore against real disposable PostgreSQL. Only the
// API/web lifecycle and migration-status result are controlled by this harness.
const directory = await mkdtemp(join(tmpdir(), "indieforge-restore-"));
const container = `indieforge-restore-${process.pid}`;
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
  ]).trim();
const document = await readFile("docs/deployment.md", "utf8");
const restoreBlock = [...document.matchAll(/```bash\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .find((block) => block.startsWith("restore_database()"));
assert.ok(restoreBlock, "runbook must provide an executable restore function");
const restoreFunction = restoreBlock.slice(
  0,
  restoreBlock.lastIndexOf("\nrestore_database "),
);
const lifecycleFile = join(directory, "lifecycle");
const harness = `
compose() {
  case "$1" in
    ps) return 0 ;;
    stop)
      test "$*" = 'stop api web migrate' || return 97
      printf 'stop\\n' >> "$DRILL_LIFECYCLE"
      ;;
    up) printf 'start\\n' >> "$DRILL_LIFECYCLE" ;;
    run)
      printf 'verify\\n' >> "$DRILL_LIFECYCLE"
      test "$*" = 'run --rm --no-deps migrate pnpm --filter @indieforge/database prisma migrate status' || return 98
      return "$DRILL_VERIFY_EXIT"
      ;;
    exec)
      shift 3
      if [[ "$DRILL_RESTORE_FAIL" == 1 && "$*" == *'pg_restore --clean'* ]]; then return 33; fi
      ${dockerPrefix.length ? "sudo " : ""}docker exec -i -e POSTGRES_DB="$DRILL_DATABASE" "$DRILL_CONTAINER" "$@"
      ;;
    *) return 99 ;;
  esac
}
${restoreFunction}
restore_database "$DRILL_BACKUP"
`;
const backup = join(directory, "before.dump");
const invoke = async (confirmation, overrides = {}) => {
  await writeFile(lifecycleFile, "");
  const result = spawnSync("bash", ["-c", harness], {
    input: `${confirmation}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      DRILL_CONTAINER: container,
      DRILL_BACKUP: backup,
      DRILL_DATABASE: "drill",
      DRILL_LIFECYCLE: lifecycleFile,
      DRILL_VERIFY_EXIT: "0",
      DRILL_RESTORE_FAIL: "0",
      ...overrides,
    },
  });
  return {
    ...result,
    lifecycle: (await readFile(lifecycleFile, "utf8")).trim(),
  };
};

try {
  docker([
    "run",
    "-d",
    "--pull=never",
    "--name",
    container,
    "--tmpfs",
    "/var/lib/postgresql/data:rw",
    "-e",
    "POSTGRES_USER=drill",
    "-e",
    "POSTGRES_DB=drill",
    "-e",
    "POSTGRES_PASSWORD=restore-drill-only",
    "postgres:16-alpine",
  ]);
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      docker(["exec", container, "pg_isready", "-h", "127.0.0.1"], {
        stdio: "pipe",
      });
      sql("SELECT 1");
      break;
    } catch {
      assert.ok(
        Date.now() < deadline,
        "disposable PostgreSQL startup timed out",
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  sql(
    "CREATE TABLE before_backup (id integer PRIMARY KEY); INSERT INTO before_backup VALUES (1)",
  );
  await writeFile(
    backup,
    docker(
      [
        "exec",
        container,
        "pg_dump",
        "-U",
        "drill",
        "-d",
        "drill",
        "--format=custom",
      ],
      { encoding: "buffer" },
    ),
  );
  sql(
    "CREATE TABLE after_backup (id integer); INSERT INTO before_backup VALUES (2)",
  );

  const maintenance = await invoke("RESTORE", { DRILL_DATABASE: "postgres" });
  assert.notEqual(maintenance.status, 0);
  assert.equal(maintenance.lifecycle, "");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "2");
  console.log("maintenance database target is refused: PASS");

  const declined = await invoke("NO");
  assert.notEqual(declined.status, 0);
  assert.equal(declined.lifecycle, "");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "2");
  console.log("declined confirmation preserves database: PASS");

  const restored = await invoke("RESTORE");
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(sql("SELECT count(*) FROM before_backup"), "1");
  assert.equal(
    sql("SELECT to_regclass('public.after_backup') IS NULL"),
    "t",
    "restore must remove objects introduced after the backup",
  );
  assert.equal(restored.lifecycle, "stop\nverify\nstart");
  console.log(
    "clean restore removes later objects and verifies before restart: PASS",
  );

  const invalidBackup = join(directory, "invalid.dump");
  await writeFile(invalidBackup, "not a PostgreSQL archive");
  const invalid = await invoke("RESTORE", { DRILL_BACKUP: invalidBackup });
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.lifecycle, "");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "1");
  console.log("invalid archive cannot modify database: PASS");

  const failedRestore = await invoke("RESTORE", { DRILL_RESTORE_FAIL: "1" });
  assert.notEqual(failedRestore.status, 0);
  assert.equal(failedRestore.lifecycle, "stop");
  assert.equal(sql("SELECT to_regclass('public.before_backup') IS NULL"), "t");
  console.log("failed restore leaves applications stopped: PASS");

  const failedVerification = await invoke("RESTORE", {
    DRILL_VERIFY_EXIT: "42",
  });
  assert.notEqual(failedVerification.status, 0);
  assert.equal(failedVerification.lifecycle, "stop\nverify");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "1");
  console.log("failed migration verification prevents restart: PASS");
} finally {
  try {
    docker(["rm", "-f", "-v", container]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log(`cleanup: PASS (${container} removed)`);
}
