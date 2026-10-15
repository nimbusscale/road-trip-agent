# Caddy, with the front end's built files (systems design section 2).

FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:web

FROM caddy:2.11-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/web /srv
