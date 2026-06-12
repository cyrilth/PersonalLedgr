FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_CONFIG_STRICT_DEP_BUILDS=false
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

COPY cron/ ./cron/

RUN pnpm exec prisma generate

CMD ["./node_modules/.bin/tsx", "cron/src/index.ts"]
