FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter api build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Docker copies this node-owned directory into a newly created named volume.
# The API remains the only service that mounts the artifact volume.
RUN mkdir -p /var/lib/indieforge/games \
    && chown -R node:node /var/lib/indieforge

ENV COREPACK_HOME=/home/node/.cache/node/corepack
RUN corepack enable \
    && corepack prepare pnpm@10.0.0 --activate \
    && chown -R node:node /home/node/.cache

COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

USER node

CMD ["node", "apps/api/dist/main.js"]
