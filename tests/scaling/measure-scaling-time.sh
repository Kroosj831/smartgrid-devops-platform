#!/usr/bin/env bash

set -Eeuo pipefail

APP="${1:-data-collector}"
NAMESPACE="${2:-smartgrid-dev}"
TARGET_REPLICAS="${3:-3}"
THRESHOLD_SECONDS="${4:-30}"
TIMEOUT_SECONDS="${5:-120}"

HPA_NAME="data-collector-hpa"
HPA_FILE="${HPA_FILE:-k8s/hpa/data-collector-hpa.yaml}"
K6_SCRIPT="${K6_SCRIPT:-tests/k6/load-test.js}"

LOCAL_PORT="${LOCAL_PORT:-13002}"
SERVICE_PORT="${SERVICE_PORT:-3002}"

VUS="${VUS:-10}"
DURATION="${DURATION:-60s}"
CPU_DURATION_MS="${CPU_DURATION_MS:-30}"
SLEEP_SECONDS="${SLEEP_SECONDS:-0.1}"

OFFICIAL_MEASUREMENT="${OFFICIAL_MEASUREMENT:-NO}"
RUN_ID="${RUN_ID:-SCALING-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM}"

if [ "$OFFICIAL_MEASUREMENT" = "YES" ]; then
  RUN_DIR="reports/experiments/scaling/$RUN_ID"
else
  RUN_DIR="reports/diagnostics/${RUN_ID}-hpa-scaling-dry-run"
fi

mkdir -p "$RUN_DIR"

PORT_FORWARD_PID=""
K6_PID=""

cleanup() {
  set +e

  if [ -n "${K6_PID:-}" ] && kill -0 "$K6_PID" 2>/dev/null; then
    kill "$K6_PID" 2>/dev/null
    wait "$K6_PID" 2>/dev/null
  fi

  if [ -n "${PORT_FORWARD_PID:-}" ] &&
     kill -0 "$PORT_FORWARD_PID" 2>/dev/null; then
    kill "$PORT_FORWARD_PID" 2>/dev/null
    wait "$PORT_FORWARD_PID" 2>/dev/null
  fi

  kubectl delete hpa "$HPA_NAME" \
    -n "$NAMESPACE" \
    --ignore-not-found=true \
    > "$RUN_DIR/hpa-delete.log" 2>&1

  kubectl scale deployment "$APP" \
    -n "$NAMESPACE" \
    --replicas=0 \
    > "$RUN_DIR/scale-down.log" 2>&1

  set -e
}

trap cleanup EXIT

for command in kubectl k6 curl jq awk; do
  command -v "$command" >/dev/null || {
    echo "Commande absente : $command"
    exit 1
  }
done

[ -s "$HPA_FILE" ] || {
  echo "Manifeste HPA absent : $HPA_FILE"
  exit 1
}

[ -s "$K6_SCRIPT" ] || {
  echo "Script k6 absent : $K6_SCRIPT"
  exit 1
}

{
  echo "RUN_ID=$RUN_ID"
  echo "APP=$APP"
  echo "NAMESPACE=$NAMESPACE"
  echo "TARGET_REPLICAS=$TARGET_REPLICAS"
  echo "THRESHOLD_SECONDS=$THRESHOLD_SECONDS"
  echo "TIMEOUT_SECONDS=$TIMEOUT_SECONDS"
  echo "VUS=$VUS"
  echo "DURATION=$DURATION"
  echo "CPU_DURATION_MS=$CPU_DURATION_MS"
  echo "SLEEP_SECONDS=$SLEEP_SECONDS"
  echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
} > "$RUN_DIR/parameters.txt"

kubectl delete hpa "$HPA_NAME" \
  -n "$NAMESPACE" \
  --ignore-not-found=true \
  > /dev/null

kubectl scale deployment "$APP" \
  -n "$NAMESPACE" \
  --replicas=1 \
  | tee "$RUN_DIR/scale-up.log"

kubectl rollout status deployment/"$APP" \
  -n "$NAMESPACE" \
  --timeout=180s \
  | tee "$RUN_DIR/rollout.log"

kubectl apply -f "$HPA_FILE" \
  | tee "$RUN_DIR/hpa-apply.log"

HPA_METRIC_AVAILABLE="NO"

for attempt in $(seq 1 18); do
  CURRENT_CPU="$(
    kubectl get hpa "$HPA_NAME" \
      -n "$NAMESPACE" \
      -o json |
    jq -r '
      [
        .status.currentMetrics[]?
        | select(
            .type == "Resource"
            and .resource.name == "cpu"
          )
        | .resource.current.averageUtilization
      ][0] // empty
    '
  )"

  echo \
    "attempt=$attempt cpu=${CURRENT_CPU:-unknown}" \
    >> "$RUN_DIR/hpa-metric-wait.log"

  if [ -n "$CURRENT_CPU" ]; then
    HPA_METRIC_AVAILABLE="YES"
    break
  fi

  sleep 5
done

[ "$HPA_METRIC_AVAILABLE" = "YES" ] || {
  echo "La métrique CPU du HPA est indisponible."
  exit 1
}

kubectl port-forward \
  -n "$NAMESPACE" \
  service/"$APP" \
  "$LOCAL_PORT:$SERVICE_PORT" \
  > "$RUN_DIR/port-forward.log" 2>&1 &

PORT_FORWARD_PID="$!"

SERVICE_READY="NO"

for attempt in $(seq 1 15); do
  if curl -fsS \
    --max-time 5 \
    "http://127.0.0.1:$LOCAL_PORT/health" \
    > "$RUN_DIR/health-before-load.json"
  then
    SERVICE_READY="YES"
    break
  fi

  sleep 1
done

[ "$SERVICE_READY" = "YES" ] || {
  echo "Le service data-collector est inaccessible."
  exit 1
}

curl -fsS \
  --max-time 10 \
  "http://127.0.0.1:$LOCAL_PORT/cpu-load?duration=100" \
  > "$RUN_DIR/cpu-load-precheck.json"

START_MS="$(date +%s%3N)"

BASE_URL="http://127.0.0.1:$LOCAL_PORT" \
EXPERIMENT_ID="$RUN_ID" \
VUS="$VUS" \
DURATION="$DURATION" \
CPU_DURATION_MS="$CPU_DURATION_MS" \
SLEEP_SECONDS="$SLEEP_SECONDS" \
k6 run \
  --summary-export "$RUN_DIR/k6-summary.json" \
  "$K6_SCRIPT" \
  > "$RUN_DIR/k6.log" 2>&1 &

K6_PID="$!"

TARGET_REACHED="NO"
SCALING_SECONDS="null"

: > "$RUN_DIR/scaling-observation.log"

while true; do
  NOW_MS="$(date +%s%3N)"
  ELAPSED_MS="$((NOW_MS - START_MS))"

  AVAILABLE_REPLICAS="$(
    kubectl get deployment "$APP" \
      -n "$NAMESPACE" \
      -o jsonpath='{.status.availableReplicas}'
  )"

  AVAILABLE_REPLICAS="${AVAILABLE_REPLICAS:-0}"

  CURRENT_REPLICAS="$(
    kubectl get hpa "$HPA_NAME" \
      -n "$NAMESPACE" \
      -o jsonpath='{.status.currentReplicas}'
  )"

  DESIRED_REPLICAS="$(
    kubectl get hpa "$HPA_NAME" \
      -n "$NAMESPACE" \
      -o jsonpath='{.status.desiredReplicas}'
  )"

  printf \
    'elapsed_ms=%s available=%s current=%s desired=%s\n' \
    "$ELAPSED_MS" \
    "$AVAILABLE_REPLICAS" \
    "${CURRENT_REPLICAS:-0}" \
    "${DESIRED_REPLICAS:-0}" \
    | tee -a "$RUN_DIR/scaling-observation.log"

  if [ "$AVAILABLE_REPLICAS" -ge "$TARGET_REPLICAS" ]; then
    TARGET_REACHED="YES"
    SCALING_SECONDS="$(
      awk \
        -v milliseconds="$ELAPSED_MS" \
        'BEGIN { printf "%.3f", milliseconds / 1000 }'
    )"
    break
  fi

  if [ "$ELAPSED_MS" -ge "$((TIMEOUT_SECONDS * 1000))" ]; then
    break
  fi

  sleep 1
done

set +e
wait "$K6_PID"
K6_RC="$?"
set -e

K6_PID=""

if [ -n "${PORT_FORWARD_PID:-}" ] &&
   kill -0 "$PORT_FORWARD_PID" 2>/dev/null
then
  kill "$PORT_FORWARD_PID" 2>/dev/null || true
  wait "$PORT_FORWARD_PID" 2>/dev/null || true
fi

PORT_FORWARD_PID=""

kubectl port-forward \
  -n "$NAMESPACE" \
  service/"$APP" \
  "$LOCAL_PORT:$SERVICE_PORT" \
  > "$RUN_DIR/port-forward-after-load.log" 2>&1 &

PORT_FORWARD_PID="$!"

SERVICE_AFTER_LOAD_RC=1

for attempt in $(seq 1 20)
do
  if curl -fsS \
    --max-time 5 \
    "http://127.0.0.1:$LOCAL_PORT/health" \
    > "$RUN_DIR/health-after-load.json"
  then
    SERVICE_AFTER_LOAD_RC=0
    break
  fi

  sleep 1
done

kubectl get hpa "$HPA_NAME" \
  -n "$NAMESPACE" \
  -o json \
  > "$RUN_DIR/hpa-final.json"

kubectl get pods \
  -n "$NAMESPACE" \
  -l "app=$APP" \
  -o wide \
  > "$RUN_DIR/pods-final.txt"

EXECUTION_VALID="NO"
THRESHOLD_MET="NO"
STATUS="rejected"

if [ "$TARGET_REACHED" = "YES" ] &&
   [ "$K6_RC" -eq 0 ] &&
   [ "$SERVICE_AFTER_LOAD_RC" -eq 0 ]
then
  EXECUTION_VALID="YES"
fi

if [ "$EXECUTION_VALID" = "YES" ] &&
   awk \
     -v value="$SCALING_SECONDS" \
     -v threshold="$THRESHOLD_SECONDS" \
     'BEGIN { exit !(value <= threshold) }'
then
  THRESHOLD_MET="YES"
  STATUS="validated"
fi

jq -n \
  --arg runId "$RUN_ID" \
  --arg scenario "dynamic_scaling" \
  --arg target "$APP" \
  --arg namespace "$NAMESPACE" \
  --arg targetReached "$TARGET_REACHED" \
  --arg status "$STATUS" \
  --arg executionValid "$EXECUTION_VALID" \
  --arg thresholdMet "$THRESHOLD_MET" \
  --arg officialMeasurement "$OFFICIAL_MEASUREMENT" \
  --argjson fromReplicas 1 \
  --argjson targetReplicas "$TARGET_REPLICAS" \
  --argjson scalingTimeSeconds "$SCALING_SECONDS" \
  --argjson thresholdSeconds "$THRESHOLD_SECONDS" \
  --argjson k6Rc "$K6_RC" \
  --argjson serviceAfterLoadRc "$SERVICE_AFTER_LOAD_RC" \
  '{
    runId: $runId,
    scenario: $scenario,
    target: $target,
    namespace: $namespace,
    fromReplicas: $fromReplicas,
    targetReplicas: $targetReplicas,
    targetReached: $targetReached,
    executionValid: $executionValid,
    thresholdMet: $thresholdMet,
    metricName: "scaling_time",
    scalingTimeSeconds: $scalingTimeSeconds,
    thresholdSeconds: $thresholdSeconds,
    k6Rc: $k6Rc,
    serviceAfterLoadRc: $serviceAfterLoadRc,
    status: $status,
    officialMeasurement: $officialMeasurement
  }' \
  > "$RUN_DIR/result.json"

cat "$RUN_DIR/result.json"

cleanup
trap - EXIT

SMARTGRID_REPLICA_SUM="$(
  kubectl get deployments \
    -n "$NAMESPACE" \
    -o json |
  jq '[.items[] | (.spec.replicas // 0)] | add // 0'
)"

HPA_RESIDUAL_COUNT="$(
  kubectl get hpa \
    -n "$NAMESPACE" \
    -o json |
  jq '.items | length'
)"

{
  echo "SMARTGRID_REPLICA_SUM=$SMARTGRID_REPLICA_SUM"
  echo "HPA_RESIDUAL_COUNT=$HPA_RESIDUAL_COUNT"
  echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
} > "$RUN_DIR/final-rest-state.txt"

echo "RUN_DIR=$RUN_DIR"
