FROM node:alpine AS base

FROM base AS builder

WORKDIR /app

RUN apk add pnpm

COPY package.json pnpm-lock.yaml /app/

RUN pnpm install

COPY tsconfig.json main.ts /app/

RUN pnpm tsc

FROM base AS runner

WORKDIR /app

COPY --from=builder /app/dist/main.js /app/
COPY --from=builder /app/node_modules /app/node_modules

CMD [ "node", "/app/main.js" ]
