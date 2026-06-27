#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.."
  pwd
)"

cd "$ROOT_DIR"

API_TAR="$(mktemp --suffix=.tar /tmp/dashboard-api.XXXXXX)"
FRONTEND_TAR="$(mktemp --suffix=.tar /tmp/dashboard-frontend.XXXXXX)"

cleanup() {
  rm -f "$API_TAR" "$FRONTEND_TAR"

  sudo systemctl stop docker.service docker.socket 2>/dev/null || true
  sudo systemctl stop containerd.service 2>/dev/null || true
}

trap cleanup EXIT INT TERM

for command_name in docker sudo
do
  if ! command -v "$command_name" >/dev/null 2>&1
  then
    echo "Commande manquante : $command_name" >&2
    exit 1
  fi
done

if [[ ! -x /usr/local/bin/k3s ]]
then
  echo "K3s est introuvable dans /usr/local/bin/k3s" >&2
  exit 1
fi

echo "Validation des droits sudo..."
sudo -v

echo "Démarrage temporaire de Docker..."
sudo systemctl start docker.service

for attempt in {1..30}
do
  if docker info >/dev/null 2>&1
  then
    break
  fi

  if [[ "$attempt" -eq 30 ]]
  then
    echo "Docker n'est pas devenu opérationnel." >&2
    exit 1
  fi

  sleep 2
done

echo "============================================"
echo "Construction de dashboard-api:latest"

docker build \
  --progress=plain \
  --tag dashboard-api:latest \
  --file dashboard/dashboard-api/Dockerfile \
  .

echo "Export de dashboard-api..."
docker save \
  --output "$API_TAR" \
  dashboard-api:latest

echo "Import de dashboard-api dans K3s..."
sudo /usr/local/bin/k3s ctr images import "$API_TAR"

rm -f "$API_TAR"

echo "============================================"
echo "Construction de dashboard-frontend:latest"

docker build \
  --progress=plain \
  --tag dashboard-frontend:latest \
  --file dashboard/dashboard-frontend/Dockerfile \
  .

echo "Export de dashboard-frontend..."
docker save \
  --output "$FRONTEND_TAR" \
  dashboard-frontend:latest

echo "Import de dashboard-frontend dans K3s..."
sudo /usr/local/bin/k3s ctr images import "$FRONTEND_TAR"

rm -f "$FRONTEND_TAR"

echo "============================================"
echo "Images importées dans K3s :"

sudo /usr/local/bin/k3s ctr images list |
grep -E 'dashboard-api|dashboard-frontend'

echo "Construction et importation terminées."
