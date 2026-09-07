import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const jwtSecret =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const postgresPassword = '0123456789abcdef0123456789abcdef';
const environment = `DEPLOY_ADDRESS=:80
HTTP_PORT=8080
SITE_ORIGIN=http://localhost:8080
POSTGRES_DB=indieforge
POSTGRES_USER=indieforge
POSTGRES_PASSWORD=${postgresPassword}
JWT_SECRET=${jwtSecret}
`;

const environmentExample = await readFile('.env.production.example', 'utf8');
const deploymentRunbook = await readFile('docs/deployment.md', 'utf8');
const postgresPasswordDocumentation =
  environmentExample.match(/(?:^#.*\n)+POSTGRES_PASSWORD=/m)?.[0] ?? '';
assert.match(postgresPasswordDocumentation, /URL-safe hexadecimal/i);
assert.match(postgresPasswordDocumentation, /openssl rand -hex 32/);
assert.match(postgresPassword, /^[0-9a-f]+$/);

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'indieforge-deployment-config-'),
);
const environmentFile = join(temporaryDirectory, '.env.production');

try {
  await writeFile(environmentFile, environment);

  const rendered = execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      environmentFile,
      '-f',
      'compose.production.yml',
      'config',
      '--format',
      'json',
    ],
    { encoding: 'utf8', env: { ...process.env, COOKIE_SECURE: '' } },
  );
  const configuration = JSON.parse(rendered);
  const { services } = configuration;

  assert.equal(services.api.environment.COOKIE_SECURE, 'true');
  const previewConfiguration = JSON.parse(execFileSync(
    'docker',
    ['compose', '--env-file', environmentFile, '-f', 'compose.production.yml', 'config', '--format', 'json'],
    { encoding: 'utf8', env: { ...process.env, COOKIE_SECURE: 'false' } },
  ));
  assert.equal(previewConfiguration.services.api.environment.COOKIE_SECURE, 'false');

  assert.deepEqual(Object.keys(services).sort(), [
    'api',
    'migrate',
    'postgres',
    'proxy',
    'web',
  ]);
  assert.deepEqual(
    Object.entries(services)
      .filter(([, service]) => service.ports !== undefined)
      .map(([name]) => name),
    ['proxy'],
  );
  assert.ok(services.postgres.healthcheck, 'postgres must have a healthcheck');
  assert.equal(
    services.migrate.depends_on.postgres.condition,
    'service_healthy',
  );
  assert.equal(
    services.api.depends_on.migrate.condition,
    'service_completed_successfully',
  );
  assert.equal(
    services.web.environment.API_INTERNAL_URL,
    'http://api:3001',
  );
  assert.equal(
    services.api.environment.WEB_ORIGIN,
    'http://localhost:8080',
  );
  const expectedDatabaseUrl =
    `postgresql://indieforge:${postgresPassword}@postgres:5432/indieforge`;
  assert.equal(services.migrate.environment.DATABASE_URL, expectedDatabaseUrl);
  assert.equal(services.api.environment.DATABASE_URL, expectedDatabaseUrl);
  assert.ok(
    services.proxy.ports.some(
      (port) => String(port.published) === '8080' && port.target === 80,
    ),
    'proxy must map host port 8080 to container port 80',
  );

  for (const [serviceName, service] of Object.entries(services)) {
    for (const [argumentName, value] of Object.entries(
      service.build?.args ?? {},
    )) {
      assert.ok(
        !String(value).includes(jwtSecret),
        `${serviceName}.build.args.${argumentName} must not contain JWT_SECRET`,
      );
    }

    for (const [variableName, value] of Object.entries(
      service.environment ?? {},
    )) {
      if (serviceName === 'api' && variableName === 'JWT_SECRET') continue;
      assert.ok(
        !String(value).includes(jwtSecret),
        `${serviceName}.environment.${variableName} must not contain JWT_SECRET`,
      );
    }
  }

  assert.equal(services.api.environment.JWT_SECRET, jwtSecret);
  assert.equal(
    services.api.environment.GAME_STORAGE_ROOT,
    '/var/lib/indieforge/games',
  );
  assert.equal(services.api.environment.GAME_UPLOAD_MAX_BYTES, '26214400');
  assert.deepEqual(services.api.volumes, [
    {
      type: 'volume',
      source: 'game_storage',
      target: '/var/lib/indieforge/games',
      volume: {},
    },
  ]);
  assert.ok(
    configuration.volumes.game_storage !== undefined,
    'game artifact storage must be declared as a named volume',
  );
  assert.deepEqual(
    Object.entries(services)
      .filter(([, service]) => service.build?.dockerfile === 'apps/api/Dockerfile')
      .map(([name]) => name),
    ['api'],
    'the API image must be built once and shared with the migration job',
  );
  assert.equal(services.migrate.image, services.api.image);

  assert.match(
    deploymentRunbook,
    /game_storage.*artifact.*backup|artifact.*backup.*game_storage/is,
    'the runbook must pair artifact-volume backups with the database dump',
  );
  assert.match(
    deploymentRunbook,
    /artifact.*restore|restore.*artifact/is,
    'the runbook must restore the matching artifact archive with the database',
  );
  assert.match(
    deploymentRunbook,
    /role.*MODERATOR|MODERATOR.*role/is,
    'the runbook must document an operator-only moderator role grant',
  );
  console.log('deployment configuration valid');
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
