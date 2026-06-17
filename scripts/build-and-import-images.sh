#!/bin/bash

set -e

SERVICES=(
  "iot-simulator"
  "data-collector"
  "processing-service"
  "optimization-service"
  "api-gateway"
)

echo "Construction et importation des images dans K3s..."

for SERVICE in "${SERVICES[@]}"; do
  echo "--------------------------------------------"
  echo "Build image: $SERVICE:latest"
  docker build -t "$SERVICE:latest" "./services/$SERVICE"

  echo "Export image: $SERVICE"
  docker save "$SERVICE:latest" -o "/tmp/$SERVICE.tar"

  echo "Import image into K3s: $SERVICE"
  sudo k3s ctr images import "/tmp/$SERVICE.tar"

  rm "/tmp/$SERVICE.tar"
done

echo "--------------------------------------------"
echo "Images disponibles dans Docker :"
docker images | grep -E "iot-simulator|data-collector|processing-service|optimization-service|api-gateway"

echo "--------------------------------------------"
echo "Images disponibles dans K3s :"
sudo k3s ctr images list | grep -E "iot-simulator|data-collector|processing-service|optimization-service|api-gateway"

echo "Toutes les images ont été construites et importées dans K3s."
