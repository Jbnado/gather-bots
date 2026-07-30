# Two stages so the shipped image carries neither the TypeScript compiler nor tsx — this is a
# small poller, and there is no reason for it to haul a toolchain around in production.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

# Copied separately so a change to source does not invalidate the dependency layer.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Re-resolve with production dependencies only. The dev tree is large and none of it runs here.
RUN pnpm prune --prod


FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# The state file is the only thing written at runtime, and it belongs to a mounted volume.
RUN mkdir -p /app/state && chown -R node:node /app/state
USER node

VOLUME ["/app/state"]

# No shell form: this way SIGTERM reaches node directly and compose stops the container promptly
# instead of waiting out the kill timeout.
CMD ["node", "dist/main.js"]
