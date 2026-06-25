#!/usr/bin/env bash

set -u -o pipefail

NAMESPACE="${NAMESPACE:-smartgrid-dev}"
REFERENCE_SECONDS="${REFERENCE_SECONDS:-180}"
ROLLOUT_TIMEOUT_SECONDS="${ROLLOUT_TIMEOUT_SECONDS:-180}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-30}"

OFFICIAL_MEASUREMENT="${OFFICIAL_MEASUREMENT:-NO}"
RUN_ID="${RUN_ID:-H1-CICD-DIAG-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
IMAGE_TAG="${IMAGE_TAG:-h1-cicd-${RUN_ID}}"

IMAGE_TAG=$(
  printf '%s' "$IMAGE_TAG" |
  tr '[:upper:]_' '[:lower:]-' |
  tr -cd 'a-z0-9.-' |
  cut -c1-100
)

SERVICES=(
  api-gateway
  iot-simulator
  data-collector
  processing-service
  optimization-service
)

SERVICE_PORTS=(
  3000
  3001
  3002
  3003
  3004
)

LOCAL_PORTS=(
  13000
  13001
  13002
  13003
  13004
)

MANIFEST="k8s/smartgrid-dev/microservices.yaml"

if [[ "$OFFICIAL_MEASUREMENT" == "YES" ]]; then
  RUN_DIR="reports/experiments/deployment/$RUN_ID"
else
  RUN_DIR="reports/diagnostics/${RUN_ID}-cicd-dry-run"
fi

if [[ -e "$RUN_DIR" ]]; then
  echo "Le dossier existe déjà : $RUN_DIR" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"

CLEANUP_DONE="NO"
CLEANUP_SUCCEEDED="NO"

cleanup() {
  if [[ "$CLEANUP_DONE" == "YES" ]]; then
    return
  fi

  CLEANUP_DONE="YES"
  set +e

  for service in "${SERVICES[@]}"; do
    kubectl scale \
      "deployment/$service" \
      -n "$NAMESPACE" \
      --replicas=0 \
      > "$RUN_DIR/scale-down-${service}.log" 2>&1
  done

  for _ in $(seq 1 180); do
    REPLICA_SUM=$(
      kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null |
      jq '[.items[] | (.spec.replicas // 0)] | add // 0'
    )

    AVAILABLE_SUM=$(
      kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null |
      jq '[.items[] | (.status.availableReplicas // 0)] | add // 0'
    )

    if [[ "${REPLICA_SUM:-1}" == "0" ]] &&
       [[ "${AVAILABLE_SUM:-1}" == "0" ]]; then
      break
    fi

    sleep 0.5
  done

  SMARTGRID_REPLICA_SUM=$(
    kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null |
    jq '[.items[] | (.spec.replicas // 0)] | add // 0'
  )

  AVAILABLE_REPLICA_SUM=$(
    kubectl get deployments -n "$NAMESPACE" -o json 2>/dev/null |
    jq '[.items[] | (.status.availableReplicas // 0)] | add // 0'
  )

  HPA_RESIDUAL_COUNT=$(
    kubectl get hpa -n "$NAMESPACE" -o name 2>/dev/null |
    wc -l |
    tr -d ' '
  )

  if [[ "${SMARTGRID_REPLICA_SUM:-1}" == "0" ]] &&
     [[ "${AVAILABLE_REPLICA_SUM:-1}" == "0" ]] &&
     [[ "${HPA_RESIDUAL_COUNT:-1}" == "0" ]]; then
    CLEANUP_SUCCEEDED="YES"
  fi

  {
    echo "SMARTGRID_REPLICA_SUM=${SMARTGRID_REPLICA_SUM:-UNKNOWN}"
    echo "AVAILABLE_REPLICA_SUM=${AVAILABLE_REPLICA_SUM:-UNKNOWN}"
    echo "HPA_RESIDUAL_COUNT=${HPA_RESIDUAL_COUNT:-UNKNOWN}"
    echo "CLEANUP_SUCCEEDED=$CLEANUP_SUCCEEDED"
    echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
  } > "$RUN_DIR/final-rest-state.txt"
}

trap cleanup EXIT INT TERM

check_health() {
  local service="$1"
  local service_port="$2"
  local local_port="$3"

  local pf_log="$RUN_DIR/port-forward-${service}.log"
  local curl_log="$RUN_DIR/health-${service}-curl-errors.log"
  local output_file="$RUN_DIR/health-${service}.json"
  local code_file="$RUN_DIR/health-${service}-http-code.txt"
  local temporary_file="${output_file}.tmp"

  : > "$pf_log"
  : > "$curl_log"

  kubectl port-forward \
    -n "$NAMESPACE" \
    "service/$service" \
    "${local_port}:${service_port}" \
    > "$pf_log" 2>&1 &

  local pf_pid=$!
  local deadline_ms
  local current_ms
  local http_code="000"

  deadline_ms=$(
    echo "$(( $(date +%s%3N) + HEALTH_TIMEOUT_SECONDS * 1000 ))"
  )

  while true; do
    current_ms=$(date +%s%3N)

    if (( current_ms >= deadline_ms )); then
      break
    fi

    if ! kill -0 "$pf_pid" 2>/dev/null; then
      break
    fi

    http_code=$(
      curl \
        -sS \
        --max-time 2 \
        -o "$temporary_file" \
        -w '%{http_code}' \
        "http://127.0.0.1:${local_port}/health" \
        2>> "$curl_log"
    ) || http_code="000"

    if [[ "$http_code" == "200" ]]; then
      mv "$temporary_file" "$output_file"
      echo "$http_code" > "$code_file"

      kill "$pf_pid" 2>/dev/null || true
      wait "$pf_pid" 2>/dev/null || true
      return 0
    fi

    sleep 0.25
  done

  echo "$http_code" > "$code_file"
  rm -f "$temporary_file"

  kill "$pf_pid" 2>/dev/null || true
  wait "$pf_pid" 2>/dev/null || true

  return 1
}

for command_name in \
  docker \
  kubectl \
  jq \
  curl \
  sudo \
  git \
  awk
do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Commande absente : $command_name" >&2
    exit 2
  fi
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Manifeste absent : $MANIFEST" >&2
  exit 2
fi

kubectl get namespace "$NAMESPACE" \
  > "$RUN_DIR/namespace-check.txt" 2>&1 || exit 2

for service in "${SERVICES[@]}"; do
  kubectl get deployment "$service" \
    -n "$NAMESPACE" \
    > "$RUN_DIR/precheck-deployment-${service}.txt" 2>&1 || exit 2

  kubectl get service "$service" \
    -n "$NAMESPACE" \
    > "$RUN_DIR/precheck-service-${service}.txt" 2>&1 || exit 2
done

INITIAL_HPA_COUNT=$(
  kubectl get hpa -n "$NAMESPACE" -o name 2>/dev/null |
  wc -l |
  tr -d ' '
)

INITIAL_REPLICA_SUM=$(
  kubectl get deployments -n "$NAMESPACE" -o json |
  jq '[.items[] | (.spec.replicas // 0)] | add // 0'
)

if [[ "$INITIAL_HPA_COUNT" != "0" ]]; then
  echo "Un HPA est actif dans $NAMESPACE." >&2
  exit 2
fi

if [[ "$INITIAL_REPLICA_SUM" != "0" ]]; then
  echo "L'environnement n'est pas au repos : replicas=$INITIAL_REPLICA_SUM" >&2
  exit 2
fi

GIT_COMMIT=$(git rev-parse HEAD)
GIT_TREE=$(git rev-parse HEAD^{tree})

{
  echo "RUN_ID=$RUN_ID"
  echo "NAMESPACE=$NAMESPACE"
  echo "IMAGE_TAG=$IMAGE_TAG"
  echo "REFERENCE_SECONDS=$REFERENCE_SECONDS"
  echo "ROLLOUT_TIMEOUT_SECONDS=$ROLLOUT_TIMEOUT_SECONDS"
  echo "HEALTH_TIMEOUT_SECONDS=$HEALTH_TIMEOUT_SECONDS"
  echo "OFFICIAL_MEASUREMENT=$OFFICIAL_MEASUREMENT"
  echo "GIT_COMMIT=$GIT_COMMIT"
  echo "GIT_TREE=$GIT_TREE"
  echo "MEASUREMENT_START=Beginning of Docker image construction"
  echo "MEASUREMENT_END=Successful rollouts and HTTP 200 health checks"
} > "$RUN_DIR/parameters.txt"

kubectl get deployments,pods,services \
  -n "$NAMESPACE" \
  -o wide \
  > "$RUN_DIR/initial-kubernetes-state.txt"

BUILD_SUCCEEDED="NO"
DEPLOYMENT_SUCCEEDED="NO"
ROLLOUT_SUCCEEDED="NO"
HEALTH_CHECKS_SUCCEEDED="NO"
FAILURE_STAGE=""

START_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
START_MS=$(date +%s%3N)

BUILD_SUCCEEDED="YES"

for service in "${SERVICES[@]}"; do
  image="${service}:${IMAGE_TAG}"
  archive="/tmp/${service}-${RUN_ID}.tar"

  if ! docker build \
    -t "$image" \
    "./services/$service" \
    > "$RUN_DIR/build-${service}.log" 2>&1; then
    BUILD_SUCCEEDED="NO"
    FAILURE_STAGE="docker-build:${service}"
    break
  fi

  if ! docker save \
    "$image" \
    -o "$archive" \
    > "$RUN_DIR/save-${service}.log" 2>&1; then
    BUILD_SUCCEEDED="NO"
    FAILURE_STAGE="docker-save:${service}"
    break
  fi

  if ! sudo -n /usr/local/bin/k3s ctr images import \
    "$archive" \
    > "$RUN_DIR/import-${service}.log" 2>&1; then
    BUILD_SUCCEEDED="NO"
    FAILURE_STAGE="k3s-import:${service}"
    rm -f "$archive"
    break
  fi

  rm -f "$archive"
done

if [[ "$BUILD_SUCCEEDED" == "YES" ]]; then
  DEPLOYMENT_SUCCEEDED="YES"

  if ! kubectl apply \
    -f "$MANIFEST" \
    > "$RUN_DIR/kubectl-apply.log" 2>&1; then
    DEPLOYMENT_SUCCEEDED="NO"
    FAILURE_STAGE="kubectl-apply"
  fi
fi

if [[ "$DEPLOYMENT_SUCCEEDED" == "YES" ]]; then
  for service in "${SERVICES[@]}"; do
    if ! kubectl set image \
      "deployment/$service" \
      "$service=${service}:${IMAGE_TAG}" \
      -n "$NAMESPACE" \
      > "$RUN_DIR/set-image-${service}.log" 2>&1; then
      DEPLOYMENT_SUCCEEDED="NO"
      FAILURE_STAGE="set-image:${service}"
      break
    fi
  done
fi

if [[ "$DEPLOYMENT_SUCCEEDED" == "YES" ]]; then
  for service in "${SERVICES[@]}"; do
    if ! kubectl scale \
      "deployment/$service" \
      -n "$NAMESPACE" \
      --replicas=1 \
      > "$RUN_DIR/scale-up-${service}.log" 2>&1; then
      DEPLOYMENT_SUCCEEDED="NO"
      FAILURE_STAGE="scale-up:${service}"
      break
    fi
  done
fi

if [[ "$DEPLOYMENT_SUCCEEDED" == "YES" ]]; then
  ROLLOUT_SUCCEEDED="YES"

  for service in "${SERVICES[@]}"; do
    if ! kubectl rollout status \
      "deployment/$service" \
      -n "$NAMESPACE" \
      --timeout="${ROLLOUT_TIMEOUT_SECONDS}s" \
      > "$RUN_DIR/rollout-${service}.log" 2>&1; then
      ROLLOUT_SUCCEEDED="NO"
      FAILURE_STAGE="rollout:${service}"
      break
    fi
  done
fi

HEALTHY_SERVICES=0

if [[ "$ROLLOUT_SUCCEEDED" == "YES" ]]; then
  HEALTH_CHECKS_SUCCEEDED="YES"

  for index in "${!SERVICES[@]}"; do
    service="${SERVICES[$index]}"
    service_port="${SERVICE_PORTS[$index]}"
    local_port="${LOCAL_PORTS[$index]}"

    if check_health "$service" "$service_port" "$local_port"; then
      HEALTHY_SERVICES=$((HEALTHY_SERVICES + 1))
    else
      HEALTH_CHECKS_SUCCEEDED="NO"
      FAILURE_STAGE="health-check:${service}"
      break
    fi
  done
fi

END_MS=$(date +%s%3N)
END_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%S.%3NZ')
DEPLOYMENT_TIME_MS=$((END_MS - START_MS))

DEPLOYMENT_TIME_SECONDS=$(
  awk -v milliseconds="$DEPLOYMENT_TIME_MS" \
    'BEGIN { printf "%.3f", milliseconds / 1000 }'
)

PIPELINE_OUTCOME="FAILURE"
STATUS="failed"
THRESHOLD_MET="NOT_EVALUATED"

if [[ "$BUILD_SUCCEEDED" == "YES" ]] &&
   [[ "$DEPLOYMENT_SUCCEEDED" == "YES" ]] &&
   [[ "$ROLLOUT_SUCCEEDED" == "YES" ]] &&
   [[ "$HEALTH_CHECKS_SUCCEEDED" == "YES" ]] &&
   [[ "$HEALTHY_SERVICES" -eq "${#SERVICES[@]}" ]]; then
  PIPELINE_OUTCOME="SUCCESS"
  STATUS="successful"

  if awk \
    -v value="$DEPLOYMENT_TIME_SECONDS" \
    -v reference="$REFERENCE_SECONDS" \
    'BEGIN { exit !(value <= reference) }'
  then
    THRESHOLD_MET="YES"
  else
    THRESHOLD_MET="NO"
  fi
fi

cleanup
trap - EXIT INT TERM

EXECUTION_VALID="YES"

jq -n \
  --arg runId "$RUN_ID" \
  --arg scenario "continuous_deployment" \
  --arg namespace "$NAMESPACE" \
  --arg gitCommit "$GIT_COMMIT" \
  --arg gitTree "$GIT_TREE" \
  --arg imageTag "$IMAGE_TAG" \
  --arg buildSucceeded "$BUILD_SUCCEEDED" \
  --arg deploymentSucceeded "$DEPLOYMENT_SUCCEEDED" \
  --arg rolloutSucceeded "$ROLLOUT_SUCCEEDED" \
  --arg healthChecksSucceeded "$HEALTH_CHECKS_SUCCEEDED" \
  --arg pipelineOutcome "$PIPELINE_OUTCOME" \
  --arg executionValid "$EXECUTION_VALID" \
  --arg thresholdMet "$THRESHOLD_MET" \
  --arg cleanupSucceeded "$CLEANUP_SUCCEEDED" \
  --arg failureStage "$FAILURE_STAGE" \
  --arg status "$STATUS" \
  --arg officialMeasurement "$OFFICIAL_MEASUREMENT" \
  --arg startTimestamp "$START_TIMESTAMP" \
  --arg endTimestamp "$END_TIMESTAMP" \
  --arg measurementDefinition \
    "Temps entre le début de la construction Docker et la validation des rollouts et des endpoints de santé" \
  --argjson deploymentTimeSeconds "$DEPLOYMENT_TIME_SECONDS" \
  --argjson referenceSeconds "$REFERENCE_SECONDS" \
  --argjson healthyServices "$HEALTHY_SERVICES" \
  --argjson expectedServices "${#SERVICES[@]}" \
  '{
    runId: $runId,
    scenario: $scenario,
    namespace: $namespace,
    gitCommit: $gitCommit,
    gitTree: $gitTree,
    imageTag: $imageTag,
    metricName: "deployment_time",
    measurementDefinition: $measurementDefinition,
    deploymentTimeSeconds: $deploymentTimeSeconds,
    referenceSeconds: $referenceSeconds,
    buildSucceeded: $buildSucceeded,
    deploymentSucceeded: $deploymentSucceeded,
    rolloutSucceeded: $rolloutSucceeded,
    healthChecksSucceeded: $healthChecksSucceeded,
    healthyServices: $healthyServices,
    expectedServices: $expectedServices,
    pipelineOutcome: $pipelineOutcome,
    executionValid: $executionValid,
    thresholdMet: $thresholdMet,
    cleanupSucceeded: $cleanupSucceeded,
    failureStage: $failureStage,
    status: $status,
    officialMeasurement: $officialMeasurement,
    startTimestamp: $startTimestamp,
    endTimestamp: $endTimestamp
  }' > "$RUN_DIR/result.json"

kubectl get deployments,pods,services \
  -n "$NAMESPACE" \
  -o wide \
  > "$RUN_DIR/final-kubernetes-state.txt" 2>&1 || true

cat "$RUN_DIR/result.json"
echo "RUN_DIR=$RUN_DIR"

if [[ "$PIPELINE_OUTCOME" == "SUCCESS" ]] &&
   [[ "$CLEANUP_SUCCEEDED" == "YES" ]]; then
  exit 0
fi

exit 1
