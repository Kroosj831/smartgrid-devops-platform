#!/bin/bash

set -e

APP=${1:-data-collector}
NAMESPACE=${2:-smartgrid-dev}
THRESHOLD=${3:-60}

mkdir -p reports/json reports/markdown reports/csv

echo "Mesure du MTTR pour l'application: $APP"
echo "Namespace: $NAMESPACE"
echo "Seuil: ${THRESHOLD}s"

OLD_POD=$(kubectl get pods -n "$NAMESPACE" -l app="$APP" -o jsonpath='{.items[0].metadata.name}')

if [ -z "$OLD_POD" ]; then
  echo "Aucun pod trouvé pour app=$APP dans le namespace $NAMESPACE"
  exit 1
fi

echo "Pod ciblé pour panne contrôlée: $OLD_POD"

START_MS=$(date +%s%3N)

kubectl delete pod "$OLD_POD" -n "$NAMESPACE" --wait=false > /dev/null

echo "Pod supprimé. Attente de récupération..."

while true; do
  NEW_READY_POD=$(kubectl get pods -n "$NAMESPACE" -l app="$APP" \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{" "}{range .status.containerStatuses[*]}{.ready}{"\n"}{end}{end}' \
    | awk -v old="$OLD_POD" '$1 != old && $2 == "Running" && $3 == "true" {print $1; exit}')

  if [ -n "$NEW_READY_POD" ]; then
    END_MS=$(date +%s%3N)
    MTTR_MS=$((END_MS - START_MS))
    MTTR_SECONDS=$(awk "BEGIN {printf \"%.3f\", $MTTR_MS / 1000}")
    break
  fi

  sleep 1
done

STATUS="rejected"
if awk "BEGIN {exit !($MTTR_SECONDS < $THRESHOLD)}"; then
  STATUS="validated"
fi

TIMESTAMP=$(date -Iseconds)

cat > reports/json/failure-mttr.json <<EOF
{
  "scenario": "controlled_failure",
  "target": "$APP",
  "namespace": "$NAMESPACE",
  "oldPod": "$OLD_POD",
  "newReadyPod": "$NEW_READY_POD",
  "metricName": "MTTR",
  "value": $MTTR_SECONDS,
  "unit": "seconds",
  "threshold": $THRESHOLD,
  "status": "$STATUS",
  "timestamp": "$TIMESTAMP"
}
EOF

cat > reports/markdown/failure-mttr.md <<EOF
# Résultat du test de panne contrôlée

- Scénario : controlled_failure
- Application ciblée : $APP
- Namespace : $NAMESPACE
- Ancien Pod supprimé : $OLD_POD
- Nouveau Pod opérationnel : $NEW_READY_POD
- Métrique : MTTR
- Valeur : $MTTR_SECONDS secondes
- Seuil : $THRESHOLD secondes
- Statut : $STATUS
- Date : $TIMESTAMP
EOF

echo "Résultat MTTR:"
cat reports/json/failure-mttr.json
