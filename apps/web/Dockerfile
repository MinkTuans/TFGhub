FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile

COPY . .
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_ADSENSE_ENABLED=false
ARG NEXT_PUBLIC_ADSENSE_CLIENT=
ARG NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT=
ARG NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_ADSENSE_ENABLED=${NEXT_PUBLIC_ADSENSE_ENABLED}
ENV NEXT_PUBLIC_ADSENSE_CLIENT=${NEXT_PUBLIC_ADSENSE_CLIENT}
ENV NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT=${NEXT_PUBLIC_ADSENSE_GAME_LEFT_TOP_SLOT}
ENV NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT=${NEXT_PUBLIC_ADSENSE_GAME_LEFT_BOTTOM_SLOT}
RUN pnpm --filter web build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV COREPACK_HOME=/home/node/.cache/node/corepack
RUN corepack enable \
    && corepack prepare pnpm@10.0.0 --activate \
    && chown -R node:node /home/node/.cache

COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

USER node

CMD ["pnpm", "--filter", "web", "start"]
