#!/bin/bash

set -e

echo "Construction et importation du Dashboard DevOps expérimental..."

echo "--------------------------------------------"
echo "Build image: dashboard-api:latest"
docker build -t dashboard-api:latest -f dashboard/dashboard-api/Dockerfile .

echo "Export image: dashboard-api"
docker save dashboard-api:latest -o /tmp/dashboard-api.tar

echo "Import image into K3s: dashboard-api"
sudo -n /usr/local/bin/k3s ctr images import /tmp/dashboard-api.tar

rm /tmp/dashboard-api.tar

echo "--------------------------------------------"
echo "Build image: dashboard-frontend:latest"
docker build -t dashboard-frontend:latest -f dashboard/dashboard-frontend/Dockerfile .

echo "Export image: dashboard-frontend"
docker save dashboard-frontend:latest -o /tmp/dashboard-frontend.tar

echo "Import image into K3s: dashboard-frontend"
sudo -n /usr/local/bin/k3s ctr images import /tmp/dashboard-frontend.tar

rm /tmp/dashboard-frontend.tar

echo "--------------------------------------------"
echo "Images dashboard disponibles dans Docker :"
docker images | grep -E "dashboard-api|dashboard-frontend"

echo "--------------------------------------------"
echo "Images dashboard disponibles dans K3s :"
sudo -n /usr/local/bin/k3s ctr images list | grep -E "dashboard-api|dashboard-frontend"

echo "Dashboard construit et importé dans K3s."
