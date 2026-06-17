#!/bin/bash

set -e

APP=${1:-data-collector}
NAMESPACE=${2:-smartgrid-dev}
TARGET_REPLICAS=${3:-3}
THRESHOLD=${4:-60}

mkdir -p reports/json reports/markdown reports/csv

echo "Mesure du scaling_time pour: $APP"
echo "Namespace: $NAMESPACE"
echo "Objectif de replicas: $TARGET_REPLICAS"
echo "Seuil: ${THRESHOLD}s"

kubectl scale deployment "$APP" -n "$NAMESPACE" --replicas=1
kubectl rollout status deployment/"$APP" -n "$NAMESPACE" --timeout=120s

START_MS=$(date +%s%3N)

echo "Déclenchement manuel du scaling vers $TARGET_REPLICAS replicas..."
kubectl scale deployment "$APP" -n "$NAMESPACE" --replicas="$TARGET_REPLICAS"

while true; do
  AVAILABLE=$(kubectl get deployment "$APP" -n "$NAMESPACE" -o jsonpath='{.status.availableReplicas}')
  AVAILABLE=${AVAILABLE:-0}

  echo "Replicas disponibles: $AVAILABLE/$TARGET_REPLICAS"

  if [ "$AVAILABLE" -ge "$TARGET_REPLICAS" ]; then
    END_MS=$(date +%s%3N)
    SCALING_MS=$((END_MS - START_MS))
    SCALING_SECONDS=$(awk "BEGIN {printf \"%.3f\", $SCALING_MS / 1000}")
    break
  fi

  sleep 1
done

STATUS="rejected"
if awk "BEGIN {exit !($SCALING_SECONDS < $THRESHOLD)}"; then
  STATUS="validated"
fi

TIMESTAMP=$(date -Iseconds)

cat > reports/json/scaling-result.json <<EOF
{
  "scenario": "dynamic_scaling",
  "target": "$APP",
  "namespace": "$NAMESPACE",
  "metricName": "scaling_time",
  "value": $SCALING_SECONDS,
  "unit": "seconds",
  "fromReplicas": 1,
  "toReplicas": $TARGET_REPLICAS,
  "threshold": $THRESHOLD,
  "status": "$STATUS",
  "timestamp": "$TIMESTAMP"
}
EOF

cat > reports/markdown/scaling-result.md <<EOF
# Résultat du test de scalabilité dynamique

- Scénario : dynamic_scaling
- Application ciblée : $APP
- Namespace : $NAMESPACE
- Métrique : scaling_time
- Passage : 1 replica vers $TARGET_REPLICAS replicas
- Valeur : $SCALING_SECONDS secondes
- Seuil : $THRESHOLD secondes
- Statut : $STATUS
- Date : $TIMESTAMP
EOF

cat >> reports/csv/experimental-results.csv <<EOF
dynamic_scaling,scaling_time,$SCALING_SECONDS,seconds,<${THRESHOLD},$STATUS,$TIMESTAMP
EOF

echo "Résultat scaling:"
cat reports/json/scaling-result.json
