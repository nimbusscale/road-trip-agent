#!/usr/bin/env bash
# Deploys one commit's images on the server (systems design section 7). The workflow
# copies compose.yaml and this folder to the server first, then runs this script.
#
# Usage: deploy.sh <commit SHA> <registry user>, with a GitHub token on stdin that can
# read the images.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: deploy.sh <commit SHA> <registry user>, with the token on stdin" >&2
  exit 2
fi
readonly sha="$1"
readonly registry_user="$2"
readonly images=(
  ghcr.io/nimbusscale/road-trip-agent-app
  ghcr.io/nimbusscale/road-trip-agent-web
  ghcr.io/nimbusscale/road-trip-agent-backup
)
readonly repo_url="https://github.com/nimbusscale/road-trip-agent"

# compose.yaml is one folder up. Compose also reads .env from there.
cd "$(dirname "$0")/.."

echo "== Pulling the images for $sha"
# The sign-in goes in a throwaway folder, so no token is left on the server.
registry_config="$(mktemp -d)"
trap 'rm -rf "$registry_config"' EXIT
docker --config "$registry_config" login ghcr.io --username "$registry_user" --password-stdin
for image in "${images[@]}"; do
  docker --config "$registry_config" pull "$image:$sha"
  # compose.yaml runs :latest, so on the server :latest is always what's deployed.
  # To go back by hand: tag an earlier commit's image as :latest, then docker compose up -d.
  docker tag "$image:$sha" "$image:latest"
done
rm -rf "$registry_config"

echo "== Starting postgres"
docker compose up --detach --wait postgres

echo "== Running the migrations from the new app image"
docker compose run --rm app node --enable-source-maps dist/app/migrate.js

echo "== Restarting the containers on the new images"
# .env sets COMPOSE_PROFILES=production on the server, so this starts backup too.
docker compose up --detach --wait --remove-orphans

echo "== Removing this app's images that are unused and more than a week old"
docker image prune --all --force \
  --filter "until=168h" \
  --filter "label=org.opencontainers.image.source=$repo_url"

echo "== Deployed $sha"
