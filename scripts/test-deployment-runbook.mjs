import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
const storageRoot = join(directory, "games");
const coverPath = "covers/game-id/1/cover";
const coverMetadataPath = "covers/game-id/1/.indieforge-cover.json";
const artifactPath = "game-id/1/index.html";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
    run)
      test "\${*:1:7}" = 'run --rm --no-deps --entrypoint sh api -c' || return 98
      script="\${!#}"
      script="$(printf '%s' "$script" | sed "s|/var/lib/indieforge/games|$DRILL_STORAGE_ROOT|g")"
      bash -c "$script"
      ;;
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
      DRILL_STORAGE_ROOT: storageRoot,
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
  await mkdir(join(storageRoot, "game-id", "1"), { recursive: true });
  await mkdir(join(storageRoot, "covers", "game-id", "1"), { recursive: true });
  await writeFile(join(storageRoot, artifactPath), "<!doctype html><title>Backup fixture</title>");
  await writeFile(join(storageRoot, coverPath), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64",
  ));
  await writeFile(join(storageRoot, coverMetadataPath), JSON.stringify({ contentType: "image/png" }));
  const originalChecksums = new Map();
  for (const path of [artifactPath, coverPath, coverMetadataPath]) {
    originalChecksums.set(path, sha256(await readFile(join(storageRoot, path))));
    await chmod(join(storageRoot, path), 0o444);
  }
  await chmod(join(storageRoot, "game-id", "1"), 0o555);
  await chmod(join(storageRoot, "covers", "game-id", "1"), 0o555);

  const apiOnly = await invokeBackup("api");
  assert.equal(apiOnly.status, 0, apiOnly.stderr);
  assert.equal(apiOnly.lifecycle, "stop:api\nstart:api\n");
  console.log("backup restores only initially running API: PASS");

  const artifactBackup = apiOnly.stdout.match(/^Artifact backup: (.+)$/m)?.[1];
  assert.ok(artifactBackup, "backup must identify the entire game-storage archive");
  const manifest = artifactBackup.replace(/\.artifacts\.tar\.gz$/, ".sha256");
  assert.ok(await stat(join(directory, manifest)).catch(() => null), "backup must publish a SHA-256 manifest for the database and game storage");
  const manifestText = await readFile(join(directory, manifest), "utf8");
  assert.equal(manifestText.trim().split("\n").length, 2);
  execFileSync("sha256sum", ["--check", "--status", manifest], { cwd: directory });
  assert.equal((await stat(join(directory, manifest))).mode & 0o077, 0);
  const restoredRoot = join(directory, "restored");
  await mkdir(restoredRoot);
  execFileSync("tar", ["-C", restoredRoot, "--same-permissions", "-xzf", join(directory, artifactBackup)]);
  for (const [path, checksum] of originalChecksums) {
    assert.equal(sha256(await readFile(join(restoredRoot, path))), checksum, `${path} SHA-256 must survive backup/extraction`);
    assert.equal((await stat(join(restoredRoot, path))).mode & 0o777, 0o444);
  }
  console.log("backup preserves sealed cover bytes/metadata beside artifacts with SHA-256 verification: PASS");

  const stopped = await invokeBackup("");
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(stopped.lifecycle, "");
  console.log("backup preserves an already stopped service: PASS");

  const bothRunning = await invokeBackup("api web");
  assert.equal(bothRunning.status, 0, bothRunning.stderr);
  assert.equal(bothRunning.lifecycle, "stop:api web\nstart:api web\n");
  console.log("backup restores both initially running services: PASS");

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
    docker(["rm", "-f", "-v", container], { stdio: "pipe" });
  } catch {
    // The backup tests run before the disposable PostgreSQL container exists.
  }
  execFileSync("chmod", ["-R", "u+w", directory]);
  await rm(directory, { recursive: true, force: true });
  console.log("cleanup: PASS (deployment runbook drill removed)");
}
