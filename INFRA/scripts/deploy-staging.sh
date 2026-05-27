#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="$ROOT_DIR/INFRA"

cd "$INFRA_DIR"

if [[ -z "${STAGING_ENV_FILE:-}" ]]; then
  echo "STAGING_ENV_FILE is required."
  exit 1
fi

printf '%s\n' "$STAGING_ENV_FILE" > .env
chmod 600 .env || true

if [[ "${DEPLOY_AI_PROFILE:-false}" == "true" ]]; then
  export COMPOSE_PROFILES=ai
fi

docker compose version
docker compose -f docker-compose.yml config >/dev/null
docker compose -f docker-compose.yml build fe be worker-ifc-generate worker-authoring worker-planning-2d worker-planning-3d

if [[ "${DEPLOY_AI_PROFILE:-false}" == "true" ]]; then
  docker compose -f docker-compose.yml build worker-rendering
fi

docker compose -f docker-compose.yml up -d --remove-orphans
docker compose -f docker-compose.yml ps
