import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
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
const document = await readFile("docs/10-deployment/runbook.md", "utf8");
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
      if [[ "$*" == *' api -ec '* ]]; then
        script="\${@: -3:1}"
        token="\${!#}"
        script="$(printf '%s' "$script" | sed "s|/var/lib/indieforge/games|$DRILL_ARTIFACT_ROOT|g")"
        bash -ec "$script" sh "$token"
      else
        printf 'verify\\n' >> "$DRILL_LIFECYCLE"
        test "$*" = 'run --rm --no-deps migrate pnpm --filter @indieforge/database prisma migrate status' || return 98
        return "$DRILL_VERIFY_EXIT"
      fi
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
restore_database "$DRILL_BACKUP" "$DRILL_ARTIFACT_BACKUP" "$DRILL_CHECKSUMS"
`;
const backup = join(directory, "before.dump");
const artifactRoot = join(directory, "games");
const artifactBackup = join(directory, "before.artifacts.tar.gz");
const checksumFile = join(directory, "before.sha256");
const coverPath = join("covers", "game-id", "1", "cover");
const coverMetadataPath = join("covers", "game-id", "1", ".indieforge-cover.json");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const invoke = async (confirmation, overrides = {}) => {
  await writeFile(lifecycleFile, "");
  if (!overrides.DRILL_CHECKSUMS) {
    await writeFile(checksumFile, execFileSync("sha256sum", [
      overrides.DRILL_BACKUP ?? backup,
      overrides.DRILL_ARTIFACT_BACKUP ?? artifactBackup,
    ]));
  }
  const result = spawnSync("bash", ["-c", harness], {
    input: `${confirmation}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      DRILL_CONTAINER: container,
      DRILL_BACKUP: backup,
      DRILL_ARTIFACT_BACKUP: artifactBackup,
      DRILL_ARTIFACT_ROOT: artifactRoot,
      DRILL_DATABASE: "drill",
      DRILL_LIFECYCLE: lifecycleFile,
      DRILL_VERIFY_EXIT: "0",
      DRILL_RESTORE_FAIL: "0",
      DRILL_CHECKSUMS: checksumFile,
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
  await mkdir(join(artifactRoot, "before-game", "1"), { recursive: true });
  await writeFile(join(artifactRoot, "before-game", "1", "index.html"), "before");
  await chmod(join(artifactRoot, "before-game", "1", "index.html"), 0o444);
  await chmod(join(artifactRoot, "before-game", "1"), 0o555);
  await mkdir(join(artifactRoot, "covers", "game-id", "1"), { recursive: true });
  const coverBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64",
  );
  const coverMetadata = JSON.stringify({ contentType: "image/png" });
  await writeFile(join(artifactRoot, coverPath), coverBytes);
  await writeFile(join(artifactRoot, coverMetadataPath), coverMetadata);
  await chmod(join(artifactRoot, coverPath), 0o444);
  await chmod(join(artifactRoot, coverMetadataPath), 0o444);
  await chmod(join(artifactRoot, "covers", "game-id", "1"), 0o555);
  execFileSync("tar", ["-C", artifactRoot, "-czf", artifactBackup, "."]);
  await mkdir(join(artifactRoot, "covers", "game-id", "2"));
  await writeFile(join(artifactRoot, "covers", "game-id", "2", "cover"), "later cover");
  await mkdir(join(artifactRoot, "after-game", "1"), { recursive: true });
  await writeFile(join(artifactRoot, "after-game", "1", "index.html"), "after");
  await chmod(join(artifactRoot, "after-game", "1", "index.html"), 0o444);
  await chmod(join(artifactRoot, "after-game", "1"), 0o555);
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

  const wrongChecksums = join(directory, "wrong.sha256");
  await writeFile(wrongChecksums, `${"0".repeat(64)}  ${backup}\n${"0".repeat(64)}  ${artifactBackup}\n`);
  const checksumFailure = await invoke("RESTORE", { DRILL_CHECKSUMS: wrongChecksums });
  assert.notEqual(checksumFailure.status, 0, "checksum mismatch must abort restore");
  assert.equal(checksumFailure.lifecycle, "", "checksum mismatch must fail before services stop");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "2");
  assert.equal(await readFile(join(artifactRoot, "covers", "game-id", "2", "cover"), "utf8"), "later cover");
  console.log("checksum mismatch preserves database, covers, and service state: PASS");

  const restored = await invoke("RESTORE");
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(sql("SELECT count(*) FROM before_backup"), "1");
  assert.equal(
    sql("SELECT to_regclass('public.after_backup') IS NULL"),
    "t",
    "restore must remove objects introduced after the backup",
  );
  assert.equal(restored.lifecycle, "stop\nverify\nstart");
  assert.equal(
    await readFile(join(artifactRoot, "before-game", "1", "index.html"), "utf8"),
    "before",
  );
  await assert.rejects(stat(join(artifactRoot, "after-game")));
  await assert.rejects(stat(join(artifactRoot, "covers", "game-id", "2")));
  assert.equal(sha256(await readFile(join(artifactRoot, "before-game", "1", "index.html"))), sha256("before"));
  assert.equal(sha256(await readFile(join(artifactRoot, coverPath))), sha256(coverBytes));
  assert.equal(sha256(await readFile(join(artifactRoot, coverMetadataPath))), sha256(coverMetadata));
  assert.equal((await stat(join(artifactRoot, coverPath))).mode & 0o777, 0o444, "cover bytes must remain sealed and non-executable");
  assert.equal((await stat(join(artifactRoot, "covers", "game-id", "1"))).mode & 0o777, 0o555);
  console.log("restore preserves cover/artifact SHA-256 and removes later cover versions: PASS");
  assert.equal(
    (await stat(join(artifactRoot, "before-game", "1"))).mode & 0o777,
    0o555,
    "restored artifact directories must retain their sealed mode",
  );
  console.log(
    "clean restore replaces sealed artifacts and later database objects: PASS",
  );

  const invalidBackup = join(directory, "invalid.dump");
  await writeFile(invalidBackup, "not a PostgreSQL archive");
  const invalid = await invoke("RESTORE", { DRILL_BACKUP: invalidBackup });
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.lifecycle, "");
  assert.equal(sql("SELECT count(*) FROM before_backup"), "1");
  console.log("invalid archive cannot modify database: PASS");

  const invalidArtifact = join(directory, "unsafe.artifacts.tar.gz");
  const unsafeLink = join(directory, "unsafe-link");
  await symlink("before-game/1/index.html", unsafeLink);
  execFileSync("tar", ["-C", directory, "-czf", invalidArtifact, "unsafe-link"]);
  await unlink(unsafeLink);
  const artifactFailure = await invoke("RESTORE", {
    DRILL_ARTIFACT_BACKUP: invalidArtifact,
  });
  assert.notEqual(artifactFailure.status, 0);
  assert.equal(artifactFailure.lifecycle, "stop");
  assert.equal(
    sql("SELECT count(*) FROM before_backup"),
    "1",
    "a rejected artifact archive must fail before the database is dropped",
  );
  console.log("unsafe artifact archive preserves database before drop: PASS");

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
    try {
      execFileSync("chmod", ["-R", "u+w", artifactRoot]);
    } catch {
      // The root may not exist if setup failed before artifact creation.
    }
    await rm(directory, { recursive: true, force: true });
  }
  console.log(`cleanup: PASS (${container} removed)`);
}
