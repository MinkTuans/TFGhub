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
const deploymentRunbook = await readFile('docs/10-deployment/runbook.md', 'utf8');
const postgresPasswordDocumentation =
  environmentExample.match(/(?:^#.*\n)+POSTGRES_PASSWORD=/m)?.[0] ?? '';
assert.match(postgresPasswordDocumentation, /URL-safe hexadecimal/i);
assert.match(postgresPasswordDocumentation, /openssl rand -hex 32/);
assert.match(postgresPassword, /^[0-9a-f]+$/);

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), 'indieforge-deployment-config-'),
);
const environmentFile = join(temporaryDirectory, '.env.production');
const adsenseEnvironment = {
  NEXT_PUBLIC_ADSENSE_ENABLED: '',
  NEXT_PUBLIC_ADSENSE_CLIENT: '',
  NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT: '',
  NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT: '',
};
const render = (overrides = {}) => JSON.parse(execFileSync(
  'docker',
  ['compose', '--env-file', environmentFile, '-f', 'compose.production.yml', 'config', '--format', 'json'],
  { encoding: 'utf8', env: {
    ...process.env,
    ...Object.fromEntries(environment.trim().split('\n').map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    })),
    ...adsenseEnvironment, COOKIE_SECURE: '', ...overrides,
  } },
));
// Exercise the production guard with the actual values passed to the web build.
const resolveAdsense = (args) => JSON.parse(execFileSync(
  process.execPath,
  ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    'import { adsenseConfig } from "./apps/web/lib/adsense-config.ts"; process.stdout.write(JSON.stringify(adsenseConfig()));'],
  { encoding: 'utf8', env: { ...process.env, ...adsenseEnvironment, ...args } },
));

try {
  await writeFile(environmentFile, environment);

  const configuration = render();
  const { services } = configuration;

  assert.equal(services.api.environment.COOKIE_SECURE, 'true');
  const previewConfiguration = render({ COOKIE_SECURE: 'false' });
  assert.equal(previewConfiguration.services.api.environment.COOKIE_SECURE, 'false');

  assert.deepEqual(services.web.build.args, {
    NEXT_PUBLIC_API_URL: '/api',
    NEXT_PUBLIC_ADSENSE_ENABLED: 'false',
    NEXT_PUBLIC_ADSENSE_CLIENT: '',
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT: '',
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT: '',
  });
  assert.deepEqual(resolveAdsense(services.web.build.args), { enabled: false });
  const validAdsense = {
    NEXT_PUBLIC_ADSENSE_ENABLED: 'true',
    NEXT_PUBLIC_ADSENSE_CLIENT: 'ca-pub-1234567890',
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT: '1234567890',
    NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT: '0987654321',
  };
  for (const [name, overrides] of [
    ['enabled without IDs', { NEXT_PUBLIC_ADSENSE_ENABLED: 'true' }],
    ...Object.keys(adsenseEnvironment).filter((name) => name !== 'NEXT_PUBLIC_ADSENSE_ENABLED')
      .flatMap((name) => [
        [`missing ${name}`, { ...validAdsense, [name]: '' }],
        [`malformed ${name}`, { ...validAdsense, [name]: 'invalid' }],
      ]),
    ['disabled with valid IDs', { ...validAdsense, NEXT_PUBLIC_ADSENSE_ENABLED: 'false' }],
    ['nonliteral enable flag', { ...validAdsense, NEXT_PUBLIC_ADSENSE_ENABLED: 'TRUE' }],
  ]) {
    assert.deepEqual(resolveAdsense(render(overrides).services.web.build.args), { enabled: false }, name);
  }
  assert.deepEqual(resolveAdsense(render(validAdsense).services.web.build.args), {
    enabled: true,
    client: 'ca-pub-1234567890',
    slots: { gameLeftTop: '1234567890', gameLeftBottom: '0987654321' },
  });
  console.log('AdSense build args, disabled default, and invalid-ID guard: PASS');

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
  assert.equal(services.api.environment.GAME_UPLOAD_MAX_BYTES, '104857600');
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
    'game artifact and cover storage must be declared as a named volume',
  );
  assert.deepEqual(
    Object.entries(services)
      .filter(([, service]) => service.volumes?.some((volume) => volume.source === 'game_storage'))
      .map(([name]) => name),
    ['api'],
    'only the API may mount game storage; covers must not be exposed as proxy/web files',
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
