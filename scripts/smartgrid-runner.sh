#!/bin/bash

set -e

export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/config.env"

LOG_FILE="$PROJECT_DIR/logs/runner.log"
RESULTS_CSV="$PROJECT_DIR/reports/csv/results.csv"
RESULTS_JSONL="$PROJECT_DIR/reports/json/results.jsonl"
REPORT_MD="$PROJECT_DIR/reports/markdown/report.md"
K6_DIR="$PROJECT_DIR/tests/k6"

mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/reports/csv"
mkdir -p "$PROJECT_DIR/reports/json"
mkdir -p "$PROJECT_DIR/reports/markdown"
mkdir -p "$K6_DIR"

touch "$LOG_FILE"
touch "$RESULTS_JSONL"
touch "$REPORT_MD"

if [ ! -f "$RESULTS_CSV" ]; then
  echo "timestamp,scenario,metric,value,threshold,status" > "$RESULTS_CSV"
fi

notify() {
  "$SCRIPT_DIR/notify.sh" "$1" "$2"
}

record_result() {
  local scenario="$1"
  local metric="$2"
  local value="$3"
  local threshold="$4"
  local status="$5"
  local timestamp

  timestamp=$(date '+%Y-%m-%d %H:%M:%S')

  echo "$timestamp,$scenario,$metric,$value,$threshold,$status" >> "$RESULTS_CSV"

  jq -n \
    --arg timestamp "$timestamp" \
    --arg scenario "$scenario" \
    --arg metric "$metric" \
    --arg value "$value" \
    --arg threshold "$threshold" \
    --arg status "$status" \
    '{
      timestamp: $timestamp,
      scenario: $scenario,
      metric: $metric,
      value: $value,
      threshold: $threshold,
      status: $status
    }' >> "$RESULTS_JSONL"

  {
    echo ""
    echo "## $timestamp — $scenario"
    echo ""
    echo "| Métrique | Valeur | Seuil | Statut |"
    echo "|---|---:|---:|---|"
    echo "| $metric | $value | $threshold | $status |"
  } >> "$REPORT_MD"
}

check_dependencies() {
  for cmd in kubectl jq curl bc; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Dépendance manquante : $cmd"
      exit 1
    fi
  done
}

get_ready_pods() {
  local deployment="$1"

  kubectl get pods -n "$NAMESPACE" -l app="$deployment" -o json \
    | jq '[.items[] | select(.status.containerStatuses != null) | select([.status.containerStatuses[].ready] | all)] | length'
}

get_desired_replicas() {
  local deployment="$1"

  kubectl get deployment "$deployment" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}'
}

scenario_health() {
  echo "Exécution du scénario nominal : health"

  local total_pods
  local running_pods
  local status

  total_pods=$(kubectl get pods -n "$NAMESPACE" --no-headers | wc -l)
  running_pods=$(kubectl get pods -n "$NAMESPACE" --no-headers | grep -c "Running" || true)

  if [ "$total_pods" -gt 0 ] && [ "$total_pods" -eq "$running_pods" ]; then
    status="VALIDÉ"
    notify "SMARTGRID HEALTH" "Tous les pods sont Running : $running_pods/$total_pods"
  else
    status="REJETÉ"
    notify "ALERTE SMARTGRID" "Pods Running : $running_pods/$total_pods"
  fi

  record_result "health" "running_pods" "$running_pods/$total_pods" "100%" "$status"
}

scenario_failure() {
  echo "Exécution du scénario de panne"

  local deployment="$FAILURE_DEPLOYMENT"
  local desired
  local pod_to_delete
  local start_time
  local end_time
  local mttr
  local ready
  local status
  local recovered_pod

  desired=$(get_desired_replicas "$deployment")
  pod_to_delete=$(kubectl get pods -n "$NAMESPACE" -l app="$deployment" -o jsonpath='{.items[0].metadata.name}')

  if [ -z "$pod_to_delete" ]; then
    notify "ALERTE SMARTGRID" "Aucun pod trouvé pour le déploiement $deployment"
    record_result "failure" "mttr_seconds" "N/A" "$THRESHOLD_MTTR" "REJETÉ"
    exit 1
  fi

  echo "Pod ciblé pour la panne contrôlée : $pod_to_delete"

  start_time=$(date +%s)

  kubectl delete pod "$pod_to_delete" -n "$NAMESPACE" --wait=false >/dev/null

  echo "Attente de la disparition du pod supprimé..."

  while kubectl get pod "$pod_to_delete" -n "$NAMESPACE" >/dev/null 2>&1; do
    sleep 1
  done

  echo "Attente du rétablissement du service..."

  while true; do
    ready=$(get_ready_pods "$deployment")

    recovered_pod=$(kubectl get pods -n "$NAMESPACE" -l app="$deployment" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

    if [ "$ready" -ge "$desired" ] && [ -n "$recovered_pod" ] && [ "$recovered_pod" != "$pod_to_delete" ]; then
      break
    fi

    sleep 1
  done

  end_time=$(date +%s)
  mttr=$((end_time - start_time))

  if [ "$mttr" -le "$THRESHOLD_MTTR" ]; then
    status="VALIDÉ"
    notify "SMARTGRID FAILURE" "MTTR observé : ${mttr}s, seuil : ${THRESHOLD_MTTR}s"
  else
    status="REJETÉ"
    notify "ALERTE SMARTGRID" "MTTR trop élevé : ${mttr}s, seuil : ${THRESHOLD_MTTR}s"
  fi

  record_result "failure" "mttr_seconds" "$mttr" "$THRESHOLD_MTTR" "$status"
}

scenario_deployment() {
  echo "Exécution du scénario de déploiement continu"

  local deployment="$DEPLOYMENT_TARGET"
  local start_time
  local end_time
  local deployment_time
  local status

  start_time=$(date +%s)

  kubectl rollout restart deployment "$deployment" -n "$NAMESPACE" >/dev/null
  kubectl rollout status deployment "$deployment" -n "$NAMESPACE" --timeout=300s >/dev/null

  end_time=$(date +%s)
  deployment_time=$((end_time - start_time))

  if [ "$deployment_time" -le "$THRESHOLD_DEPLOYMENT_TIME" ]; then
    status="VALIDÉ"
    notify "SMARTGRID DEPLOYMENT" "Temps de déploiement : ${deployment_time}s, seuil : ${THRESHOLD_DEPLOYMENT_TIME}s"
  else
    status="REJETÉ"
    notify "ALERTE SMARTGRID" "Déploiement lent : ${deployment_time}s, seuil : ${THRESHOLD_DEPLOYMENT_TIME}s"
  fi

  record_result "deployment" "deployment_time_seconds" "$deployment_time" "$THRESHOLD_DEPLOYMENT_TIME" "$status"
}

scenario_scaling() {
  echo "Exécution du scénario de scalabilité"

  local deployment="$SCALING_DEPLOYMENT"
  local start_time
  local end_time
  local scaling_time
  local ready
  local status

  start_time=$(date +%s)

  kubectl scale deployment "$deployment" -n "$NAMESPACE" --replicas="$SCALE_TO" >/dev/null

  while true; do
    ready=$(get_ready_pods "$deployment")

    if [ "$ready" -ge "$SCALE_TO" ]; then
      break
    fi

    sleep 1
  done

  end_time=$(date +%s)
  scaling_time=$((end_time - start_time))

  if [ "$scaling_time" -le "$THRESHOLD_SCALING_TIME" ]; then
    status="VALIDÉ"
    notify "SMARTGRID SCALING" "Temps de scalabilité : ${scaling_time}s, seuil : ${THRESHOLD_SCALING_TIME}s"
  else
    status="REJETÉ"
    notify "ALERTE SMARTGRID" "Scaling lent : ${scaling_time}s, seuil : ${THRESHOLD_SCALING_TIME}s"
  fi

  record_result "scaling" "scaling_time_seconds" "$scaling_time" "$THRESHOLD_SCALING_TIME" "$status"
}

scenario_load() {
  echo "Exécution du scénario de forte charge"

  if ! command -v k6 >/dev/null 2>&1; then
    notify "ALERTE SMARTGRID" "k6 n'est pas installé, test de charge impossible."
    record_result "load" "error_rate_percent" "N/A" "$THRESHOLD_ERROR_RATE" "REJETÉ"
    echo "k6 n'est pas installé."
    exit 1
  fi

  local k6_script="$K6_DIR/load-test.js"
  local k6_summary="$K6_DIR/summary.json"
  local error_rate
  local error_percent
  local status

  cat > "$k6_script" <<EOF
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 20,
  duration: '30s',
};

export default function () {
  const res = http.get('$LOAD_TEST_URL');

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
EOF

  k6 run --summary-export "$k6_summary" "$k6_script" >/dev/null

  error_rate=$(jq -r '.metrics.http_req_failed.value // .metrics.http_req_failed.values.rate // .metrics.http_req_failed.rate // 0' "$k6_summary")
  if [ -z "$error_rate" ] || [ "$error_rate" = "null" ]; then
    error_rate=0
  fi

  error_percent=$(echo "$error_rate * 100" | bc -l)
  error_percent=$(printf "%.2f" "$error_percent")

  if (( $(echo "$error_percent <= $THRESHOLD_ERROR_RATE" | bc -l) )); then
    status="VALIDÉ"
    notify "SMARTGRID LOAD" "Taux d'erreur : ${error_percent}%, seuil : ${THRESHOLD_ERROR_RATE}%"
  else
    status="REJETÉ"
    notify "ALERTE SMARTGRID" "Taux d'erreur élevé : ${error_percent}%, seuil : ${THRESHOLD_ERROR_RATE}%"
  fi

  record_result "load" "error_rate_percent" "$error_percent" "$THRESHOLD_ERROR_RATE" "$status"
}

scenario_full() {
  scenario_health
  scenario_load
  scenario_failure
  scenario_deployment
  scenario_scaling
}

main() {
  check_dependencies

  local scenario="$1"

  case "$scenario" in
    health)
      scenario_health
      ;;
    load)
      scenario_load
      ;;
    failure)
      scenario_failure
      ;;
    deployment)
      scenario_deployment
      ;;
    scaling)
      scenario_scaling
      ;;
    full)
      scenario_full
      ;;
    *)
      echo "Usage : $0 {health|load|failure|deployment|scaling|full}"
      exit 1
      ;;
  esac
}

main "$1"
