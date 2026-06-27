#!/usr/bin/env bash

set -Eeuo pipefail

APP="${1:-data-collector}"
NAMESPACE="${2:-smartgrid-dev}"
REFERENCE_SECONDS="${3:-60}"
TIMEOUT_SECONDS="${4:-120}"

SERVICE_PORT="${SERVICE_PORT:-3002}"
LOCAL_PORT="${LOCAL_PORT:-13002}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
POLL_SECONDS="${POLL_SECONDS:-0.25}"

OFFICIAL_MEASUREMENT="${OFFICIAL_MEASUREMENT:-NO}"
RUN_ID="${RUN_ID:-MTTR-$(date -u +%Y%m%dT%H%M%SZ)-$$}"

if [[ "$OFFICIAL_MEASUREMENT" == "YES" ]]; then
  RUN_DIR="reports/experiments/failure/$RUN_ID"
else
  RUN_DIR="reports/diagnostics/${RUN_ID}-mttr-dry-run"
fi

if [[ -e "$RUN_DIR" ]]; then
  echo "Le dossier d'exécution existe déjà : $RUN_DIR" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"

PF_PID=""
CLEANUP_DONE="NO"

stop_port_forward() {
  if [[ -n "${PF_PID:-}" ]] && kill -0 "$PF_PID" 2>/dev/null; then
    kill "$PF_PID" 2>/dev/null || true
    wait "$PF_PID" 2>/dev/null || true
  fi

  PF_PID=""
}

launch_port_forward() {
  local log_file="$1"

  stop_port_forward

  kubectl port-forward \
    -n "$NAMESPACE" \
    "service/$APP" \
    "${LOCAL_PORT}:${SERVICE_PORT}" \
    >> "$log_file" 2>&1 &

  PF_PID=$!
}

wait_for_health() {
  local output_file="$1"
  local code_file="$2"
  local deadline_ms="$3"
  local port_forward_log="$4"

  local now_ms
  local http_code="000"
  local temporary_file="${output_file}.tmp"

  while true; do
    now_ms=$(date +%s%3N)

    if (( now_ms >= deadline_ms )); then
      rm -f "$temporary_file"
      echo "$http_code" > "$code_file"
      return 1
    fi

    if [[ -z "${PF_PID:-}" ]] || ! kill -0 "$PF_PID" 2>/dev/null; then
      launch_port_forward "$port_forward_log"
      sleep "$POLL_SECONDS"
    fi

    if http_code=$(
      curl \
        -sS \
        --max-time 2 \
        -o "$temporary_file" \
        -w '%{http_code}' \
        "http://127.0.0.1:${LOCAL_PORT}${HEALTH_PATH}" \
        2>> "$RUN_DIR/health-curl-errors.log"
    ); then
      if [[ "$http_code" == "200" ]]; then
        mv "$temporary_file" "$output_file"
        echo "$http_code" > "$code_file"
        return 0
      fi
    fi

    sleep "$POLL_SECONDS"
  done
}

cleanup() {
  if [[ "$CLEANUP_DONE" == "YES" ]]; then
    return
  fi

  CLEANUP_DONE="YES"
  set +e

  stop_port_forward

  kubectl scale deployment "$APP" \
    -n "$NAMESPACE" \
    --replicas=0 \
    > "$RUN_DIR/scale-down.log" 2>&1

  for _ in $(seq 1 120); do
    TARGET_REPLICAS=$(
      kubectl get deployment "$APP" \
        -n "$NAMESPACE" \
        -o jsonpath='{.spec.replicas}' \
        2>/dev/null
    )

    TARGET_POD_COUNT=$(
      kubectl get pods \
        -n "$NAMESPACE" \
        -l "app=$APP" \
        -o name \
        2>/dev/null |
      wc -l |
      tr -d ' '
    )

    if [[ "${TARGET_REPLICAS:-1}" == "0" ]] &&
       [[ "${TARGET_POD_COUNT:-1}" == "0" ]]; then
      break
    fi

    sleep 0.5
  done

  SMARTGRID_REPLICA_SUM=$(
    kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null |
    jq '[.items[] | (.spec.replicas // 0)] | add // 0'
  )

  HPA_RESIDUAL_COUNT=$(
    kubectl get hpa -n "$NAMESPACE" -o name 2>/dev/null |
    wc -l |
    tr -d ' '
  )

  TARGET_POD_COUNT=$(
    kubectl get pods \
      -n "$NAMESPACE" \
      -l "app=$APP" \
      -o name \
      2>/dev/null |
    wc -l |
    tr -d ' '
  )

  {
    echo "SMARTGRID_REPLICA_SUM=${SMARTGRID_REPLICA_SUM:-UNKNOWN}"
    echo "HPA_RESIDUAL_COUNT=${HPA_RESIDUAL_COUNT:-UNKNOWN}"
    echo "TARGET_POD_COUNT=${TARGET_POD_COUNT:-UNKNOWN}"
    echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
  } > "$RUN_DIR/final-rest-state.txt"
}

trap cleanup EXIT INT TERM

for command_name in kubectl jq curl awk; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande absente : $command_name" >&2
    exit 1
  fi
done

kubectl get deployment "$APP" \
  -n "$NAMESPACE" \
  > "$RUN_DIR/deployment-check.txt"

kubectl get service "$APP" \
  -n "$NAMESPACE" \
  > "$RUN_DIR/service-check.txt"

HPA_INITIAL_COUNT=$(
  kubectl get hpa -n "$NAMESPACE" -o name 2>/dev/null |
  wc -l |
  tr -d ' '
)

if [[ "$HPA_INITIAL_COUNT" != "0" ]]; then
  echo "Un HPA est encore actif dans $NAMESPACE." >&2
  echo "Le test MTTR exige un environnement sans HPA." >&2
  exit 1
fi

{
  echo "RUN_ID=$RUN_ID"
  echo "APP=$APP"
  echo "NAMESPACE=$NAMESPACE"
  echo "REFERENCE_SECONDS=$REFERENCE_SECONDS"
  echo "TIMEOUT_SECONDS=$TIMEOUT_SECONDS"
  echo "SERVICE_PORT=$SERVICE_PORT"
  echo "LOCAL_PORT=$LOCAL_PORT"
  echo "HEALTH_PATH=$HEALTH_PATH"
  echo "POLL_SECONDS=$POLL_SECONDS"
  echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
  echo "GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo UNKNOWN)"
} > "$RUN_DIR/parameters.txt"

kubectl get deployments,pods,services \
  -n "$NAMESPACE" \
  -o wide \
  > "$RUN_DIR/initial-kubernetes-state.txt"

kubectl get events \
  -n "$NAMESPACE" \
  --sort-by=.metadata.creationTimestamp \
  > "$RUN_DIR/events-before.txt" 2>&1 || true

echo "Démarrage du service $APP avec un réplica."

kubectl scale deployment "$APP" \
  -n "$NAMESPACE" \
  --replicas=1 \
  > "$RUN_DIR/scale-up.log" 2>&1

kubectl rollout status \
  "deployment/$APP" \
  -n "$NAMESPACE" \
  --timeout="${TIMEOUT_SECONDS}s" \
  > "$RUN_DIR/rollout.log" 2>&1

kubectl get pods \
  -n "$NAMESPACE" \
  -l "app=$APP" \
  -o json \
  > "$RUN_DIR/pods-before.json"

READY_POD_COUNT=$(
  jq '
    [
      .items[]
      | select(.metadata.deletionTimestamp == null)
      | select(.status.phase == "Running")
      | select(
          any(
            .status.conditions[]?;
            .type == "Ready" and .status == "True"
          )
        )
    ]
    | length
  ' "$RUN_DIR/pods-before.json"
)

if [[ "$READY_POD_COUNT" != "1" ]]; then
  echo "Le test exige exactement un Pod prêt avant la panne." >&2
  echo "READY_POD_COUNT=$READY_POD_COUNT" >&2
  exit 1
fi

OLD_POD=$(
  jq -r '
    [
      .items[]
      | select(.metadata.deletionTimestamp == null)
      | select(.status.phase == "Running")
      | select(
          any(
            .status.conditions[]?;
            .type == "Ready" and .status == "True"
          )
        )
    ][0].metadata.name
  ' "$RUN_DIR/pods-before.json"
)

OLD_POD_UID=$(
  jq -r '
    [
      .items[]
      | select(.metadata.deletionTimestamp == null)
      | select(.status.phase == "Running")
      | select(
          any(
            .status.conditions[]?;
            .type == "Ready" and .status == "True"
          )
        )
    ][0].metadata.uid
  ' "$RUN_DIR/pods-before.json"
)

: > "$RUN_DIR/port-forward-before.log"
launch_port_forward "$RUN_DIR/port-forward-before.log"

NOW_MS=$(date +%s%3N)
PRECHECK_DEADLINE_MS=$((NOW_MS + 20000))

if ! wait_for_health \
  "$RUN_DIR/health-before.json" \
  "$RUN_DIR/health-before-http-code.txt" \
  "$PRECHECK_DEADLINE_MS" \
  "$RUN_DIR/port-forward-before.log"
then
  echo "Le service ne répond pas avant l'injection de la panne." >&2
  exit 1
fi

stop_port_forward

echo "Pod ciblé : $OLD_POD"
echo "UID ciblé : $OLD_POD_UID"

START_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
START_MS=$(date +%s%3N)
DEADLINE_MS=$((START_MS + TIMEOUT_SECONDS * 1000))

set +e
kubectl delete pod "$OLD_POD" \
  -n "$NAMESPACE" \
  --wait=false \
  > "$RUN_DIR/delete-pod.log" 2>&1
DELETE_RC=$?
set -e

NEW_READY_POD=""
NEW_READY_POD_UID=""
POD_READY="NO"
SERVICE_RECOVERED="NO"
POD_RECOVERY_JSON="null"
MTTR_JSON="null"
END_TIMESTAMP=""

if [[ "$DELETE_RC" -eq 0 ]]; then
  while true; do
    CURRENT_MS=$(date +%s%3N)

    if (( CURRENT_MS >= DEADLINE_MS )); then
      break
    fi

    kubectl get pods \
      -n "$NAMESPACE" \
      -l "app=$APP" \
      -o json \
      > "$RUN_DIR/pods-current.json"

    NEW_READY_POD=$(
      jq -r \
        --arg old_uid "$OLD_POD_UID" '
          [
            .items[]
            | select(.metadata.uid != $old_uid)
            | select(.metadata.deletionTimestamp == null)
            | select(.status.phase == "Running")
            | select(
                any(
                  .status.conditions[]?;
                  .type == "Ready" and .status == "True"
                )
              )
          ][0].metadata.name // empty
        ' "$RUN_DIR/pods-current.json"
    )

    NEW_READY_POD_UID=$(
      jq -r \
        --arg old_uid "$OLD_POD_UID" '
          [
            .items[]
            | select(.metadata.uid != $old_uid)
            | select(.metadata.deletionTimestamp == null)
            | select(.status.phase == "Running")
            | select(
                any(
                  .status.conditions[]?;
                  .type == "Ready" and .status == "True"
                )
              )
          ][0].metadata.uid // empty
        ' "$RUN_DIR/pods-current.json"
    )

    if [[ -n "$NEW_READY_POD" ]] &&
       [[ -n "$NEW_READY_POD_UID" ]]; then
      POD_READY_MS=$(date +%s%3N)
      POD_RECOVERY_MS=$((POD_READY_MS - START_MS))
      POD_RECOVERY_JSON=$(
        awk -v milliseconds="$POD_RECOVERY_MS" \
          'BEGIN { printf "%.3f", milliseconds / 1000 }'
      )
      POD_READY="YES"
      break
    fi

    sleep "$POLL_SECONDS"
  done
fi

if [[ "$POD_READY" == "YES" ]]; then
  : > "$RUN_DIR/port-forward-after.log"
  launch_port_forward "$RUN_DIR/port-forward-after.log"

  if wait_for_health \
    "$RUN_DIR/health-after.json" \
    "$RUN_DIR/health-after-http-code.txt" \
    "$DEADLINE_MS" \
    "$RUN_DIR/port-forward-after.log"
  then
    END_MS=$(date +%s%3N)
    MTTR_MS=$((END_MS - START_MS))
    MTTR_JSON=$(
      awk -v milliseconds="$MTTR_MS" \
        'BEGIN { printf "%.3f", milliseconds / 1000 }'
    )
    END_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
    SERVICE_RECOVERED="YES"
  fi
fi

kubectl get pods \
  -n "$NAMESPACE" \
  -l "app=$APP" \
  -o wide \
  > "$RUN_DIR/pods-after.txt" 2>&1 || true

kubectl get pods \
  -n "$NAMESPACE" \
  -l "app=$APP" \
  -o json \
  > "$RUN_DIR/pods-after.json" 2>&1 || true

kubectl get events \
  -n "$NAMESPACE" \
  --sort-by=.metadata.creationTimestamp \
  > "$RUN_DIR/events-after.txt" 2>&1 || true

EXECUTION_VALID="NO"
THRESHOLD_MET="NOT_EVALUATED"
STATUS="invalid"

if [[ "$DELETE_RC" -eq 0 ]] &&
   [[ "$POD_READY" == "YES" ]] &&
   [[ "$SERVICE_RECOVERED" == "YES" ]]; then
  EXECUTION_VALID="YES"
  STATUS="valid"

  if awk \
    -v value="$MTTR_JSON" \
    -v reference="$REFERENCE_SECONDS" \
    'BEGIN { exit !(value <= reference) }'
  then
    THRESHOLD_MET="YES"
  else
    THRESHOLD_MET="NO"
  fi
fi

jq -n \
  --arg runId "$RUN_ID" \
  --arg scenario "controlled_failure" \
  --arg target "$APP" \
  --arg namespace "$NAMESPACE" \
  --arg oldPod "$OLD_POD" \
  --arg oldPodUid "$OLD_POD_UID" \
  --arg newReadyPod "$NEW_READY_POD" \
  --arg newReadyPodUid "$NEW_READY_POD_UID" \
  --arg podReady "$POD_READY" \
  --arg serviceRecovered "$SERVICE_RECOVERED" \
  --arg executionValid "$EXECUTION_VALID" \
  --arg thresholdMet "$THRESHOLD_MET" \
  --arg status "$STATUS" \
  --arg officialMeasurement "$OFFICIAL_MEASUREMENT" \
  --arg startTimestamp "$START_TIMESTAMP" \
  --arg endTimestamp "$END_TIMESTAMP" \
  --argjson deleteRc "$DELETE_RC" \
  --argjson podRecoverySeconds "$POD_RECOVERY_JSON" \
  --argjson mttrSeconds "$MTTR_JSON" \
  --argjson referenceSeconds "$REFERENCE_SECONDS" \
  --argjson timeoutSeconds "$TIMEOUT_SECONDS" \
  '{
    runId: $runId,
    scenario: $scenario,
    target: $target,
    namespace: $namespace,
    oldPod: $oldPod,
    oldPodUid: $oldPodUid,
    newReadyPod: $newReadyPod,
    newReadyPodUid: $newReadyPodUid,
    podReady: $podReady,
    serviceRecovered: $serviceRecovered,
    executionValid: $executionValid,
    thresholdMet: $thresholdMet,
    metricName: "MTTR",
    measurementDefinition:
      "Temps entre la demande de suppression du Pod et le retour HTTP 200 du service après création d’un nouveau Pod prêt",
    podRecoverySeconds: $podRecoverySeconds,
    mttrSeconds: $mttrSeconds,
    referenceSeconds: $referenceSeconds,
    timeoutSeconds: $timeoutSeconds,
    deleteRc: $deleteRc,
    status: $status,
    officialMeasurement: $officialMeasurement,
    startTimestamp: $startTimestamp,
    endTimestamp: $endTimestamp
  }' > "$RUN_DIR/result.json"

cleanup
trap - EXIT INT TERM

cat "$RUN_DIR/result.json"
echo "RUN_DIR=$RUN_DIR"
