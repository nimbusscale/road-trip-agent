# Caddy, with the front end's built files (systems design section 2).

FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Vite builds these into the front end's files. They aren't secret, but they stay out
# of the repo: the workflow passes them from GitHub repo variables, and Compose from
# .env (systems design section 7).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GOOGLE_MAPS_BROWSER_KEY
RUN npm run build:web

FROM caddy:2.11-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/web /srv
