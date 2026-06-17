#!/bin/bash

set -e

SERVICES=(
  "iot-simulator"
  "data-collector"
  "processing-service"
  "optimization-service"
  "api-gateway"
)

for SERVICE in "${SERVICES[@]}"; do
  echo "Building image for $SERVICE..."
  docker build -t "$SERVICE:latest" "./services/$SERVICE"
done

echo "All images built successfully."
docker images | grep -E "iot-simulator|data-collector|processing-service|optimization-service|api-gateway"
