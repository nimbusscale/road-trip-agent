# The back end: the API now, and the agents later (systems design section 2).
# Debian rather than Alpine: the Agent SDK's Claude Code process (phase 9) is safest on glibc.

FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Install scripts are off: the image needs none of them, and lefthook's needs git.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:app

FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist/app ./dist/app
COPY settings.json ./
COPY migrations ./migrations
USER node
# The commit the image is built from, for each turn's trace (systems design section 10).
# The deploy passes it. Last, so a new commit rebuilds only this layer. A local
# Compose build has no commit to give, so its traces say "unknown".
ARG APP_COMMIT=unknown
ENV APP_COMMIT=$APP_COMMIT
EXPOSE 3000
# Migrations run from this image too: node --enable-source-maps dist/app/migrate.js
CMD ["node", "--enable-source-maps", "dist/app/main.js"]
