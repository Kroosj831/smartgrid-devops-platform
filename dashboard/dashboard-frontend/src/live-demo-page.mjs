import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive
} from "vue/dist/vue.esm-bundler.js";


const WORKFLOW_STAGES = [
  {
    id: "api-gateway",
    label: "API Gateway",
    order: 0
  },
  {
    id: "iot-simulator",
    label: "IoT Simulator",
    order: 1
  },
  {
    id: "data-collector",
    label: "Data Collector",
    order: 2
  },
  {
    id: "processing-service",
    label: "Processing Service",
    order: 3
  },
  {
    id: "optimization-service",
    label: "Optimization Service",
    order: 4
  }
];


function wait(durationMs) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, durationMs)
  );
}


function clamp(
  value,
  minimum,
  maximum
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return minimum;
  }

  return Math.min(
    Math.max(
      Math.floor(number),
      minimum
    ),
    maximum
  );
}


function roundNumber(
  value,
  precision = 3
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Number(
    number.toFixed(precision)
  );
}


function createShortIdentifier() {
  const generated =
    globalThis.crypto
      ?.randomUUID?.()
      ?.replaceAll("-", "")
      ?.slice(0, 8);

  return (
    generated ||
    Math.random()
      .toString(16)
      .slice(2, 10)
  );
}


function createRequestRecord({
  requestId,
  experimentId,
  batchId,
  index
}) {
  return {
    requestId,
    experimentId,
    batchId,
    index,

    status:
      "PENDING",

    startedAt:
      null,

    completedAt:
      null,

    durationMs:
      null,

    technicalDurationMs:
      null,

    result:
      null,

    error:
      null,

    traceError:
      null,

    trace:
      null,

    stages:
      WORKFLOW_STAGES.map(
        (stage) => ({
          ...stage,
          status:
            "PENDING",
          startedAt:
            null,
          completedAt:
            null,
          durationMs:
            null,
          input:
            null,
          output:
            null,
          error:
            null
        })
      )
  };
}


export const LiveDemoPage = {
  name:
    "LiveDemoPage",

  props: {
    apiBaseUrl: {
      type:
        String,

      required:
        true
    }
  },


  setup(props) {
    const state = reactive({
      initialized:
        false,

      initializing:
        false,

      running:
        false,

      stopping:
        false,

      error:
        null,

      config:
        null,

      controls: {
        requestCount:
          1,

        concurrency:
          1,

        demoDelayMs:
          600,

        metricsSamplingMs:
          500
      },

      batch: {
        id:
          null,

        startedAt:
          null,

        completedAt:
          null,

        total:
          0,

        skipped:
          0
      },

      requests:
        [],

      selectedRequestId:
        null,

      metrics: {
        before:
          null,

        current:
          null,

        after:
          null,

        sampledAt:
          null,

        peakMemoryByService:
          {}
      }
    });


    let metricsTimer =
      null;

    let metricsLoading =
      false;

    let stopRequested =
      false;


    const currentBatchRequests =
      computed(
        () =>
          state.requests.filter(
            (request) =>
              request.batchId ===
              state.batch.id
          )
      );


    const selectedRequest =
      computed(
        () =>
          state.requests.find(
            (request) =>
              request.requestId ===
              state.selectedRequestId
          ) ??
          null
      );


    const batchSummary =
      computed(
        () => {
          const requests =
            currentBatchRequests.value;

          const completed =
            requests.filter(
              (request) =>
                request.status ===
                "COMPLETED"
            );

          const failed =
            requests.filter(
              (request) =>
                request.status ===
                "FAILED"
            );

          const running =
            requests.filter(
              (request) =>
                [
                  "PENDING",
                  "SUBMITTING",
                  "RUNNING"
                ].includes(
                  request.status
                )
            );

          const durations =
            completed
              .map(
                (request) =>
                  Number(
                    request
                      .technicalDurationMs
                  )
              )
              .filter(
                (duration) =>
                  Number.isFinite(
                    duration
                  )
              );

          const meanTechnicalDurationMs =
            durations.length
              ? durations.reduce(
                  (
                    total,
                    duration
                  ) =>
                    total + duration,
                  0
                ) /
                durations.length
              : null;

          return {
            planned:
              state.batch.total,

            started:
              requests.length,

            completed:
              completed.length,

            failed:
              failed.length,

            running:
              running.length,

            skipped:
              state.batch.skipped,

            meanTechnicalDurationMs:
              roundNumber(
                meanTechnicalDurationMs
              )
          };
        }
      );


    const metricRows =
      computed(
        () => {
          const currentServices =
            state.metrics.current
              ?.services ??
            [];

          const beforeServices =
            state.metrics.before
              ?.services ??
            [];

          return currentServices.map(
            (current) => {
              const before =
                beforeServices.find(
                  (service) =>
                    service.id ===
                    current.id
                );

              const cpuDelta =
                before
                  ? Number(
                      current
                        .cpuSecondsTotal
                    ) -
                    Number(
                      before
                        .cpuSecondsTotal
                    )
                  : null;

              const workflowDelta =
                before
                  ? Number(
                      current
                        .workflowRequestsTotal
                    ) -
                    Number(
                      before
                        .workflowRequestsTotal
                    )
                  : null;

              const globalHttpDelta =
                before
                  ? Number(
                      current
                        .httpRequestsTotal
                    ) -
                    Number(
                      before
                        .httpRequestsTotal
                    )
                  : null;

              return {
                ...current,

                cpuDelta:
                  roundNumber(
                    cpuDelta,
                    6
                  ),

                workflowDelta:
                  roundNumber(
                    workflowDelta,
                    0
                  ),

                globalHttpDelta:
                  roundNumber(
                    globalHttpDelta,
                    0
                  ),

                memoryBeforeMiB:
                  before
                    ?.memoryMiB ??
                  null,

                peakMemoryMiB:
                  state.metrics
                    .peakMemoryByService[
                      current.id
                    ] ??
                  current.memoryMiB
              };
            }
          );
        }
      );


    const metricsSummary =
      computed(
        () =>
          metricRows.value.reduce(
            (
              summary,
              service
            ) => ({
              cpuDelta:
                summary.cpuDelta +
                Number(
                  service.cpuDelta ||
                  0
                ),

              memoryMiB:
                summary.memoryMiB +
                Number(
                  service.memoryMiB ||
                  0
                ),

              peakMemoryMiB:
                summary.peakMemoryMiB +
                Number(
                  service
                    .peakMemoryMiB ||
                  0
                ),

              workflowDelta:
                summary.workflowDelta +
                Number(
                  service
                    .workflowDelta ||
                  0
                )
            }),
            {
              cpuDelta:
                0,

              memoryMiB:
                0,

              peakMemoryMiB:
                0,

              workflowDelta:
                0
            }
          )
      );


    async function fetchJson(
      path,
      options = {}
    ) {
      const headers = {
        accept:
          "application/json",

        ...(
          options.body
            ? {
                "content-type":
                  "application/json"
              }
            : {}
        ),

        ...(options.headers || {})
      };

      const response =
        await fetch(
          `${props.apiBaseUrl}${path}`,
          {
            ...options,
            headers
          }
        );

      const rawContent =
        await response.text();

      let payload =
        null;

      try {
        payload =
          rawContent
            ? JSON.parse(
                rawContent
              )
            : {};
      } catch {
        payload = {
          rawContent
        };
      }

      if (!response.ok) {
        const error =
          new Error(
            payload?.error ||
            payload?.message ||
            `Erreur HTTP ${response.status}`
          );

        error.status =
          response.status;

        error.payload =
          payload;

        throw error;
      }

      return payload;
    }


    function updateMetricPeaks(
      snapshot
    ) {
      for (
        const service
        of snapshot?.services ?? []
      ) {
        const currentMemory =
          Number(
            service.memoryMiB
          );

        if (
          !Number.isFinite(
            currentMemory
          )
        ) {
          continue;
        }

        const previousPeak =
          Number(
            state.metrics
              .peakMemoryByService[
                service.id
              ] ??
            currentMemory
          );

        state.metrics
          .peakMemoryByService[
            service.id
          ] =
          Math.max(
            previousPeak,
            currentMemory
          );
      }
    }


    async function sampleMetrics(
      phase = "current"
    ) {
      if (metricsLoading) {
        return null;
      }

      metricsLoading =
        true;

      try {
        const snapshot =
          await fetchJson(
            "/api/demo/metrics"
          );

        state.metrics.current =
          snapshot;

        state.metrics.sampledAt =
          snapshot.sampledAt;

        if (phase === "before") {
          state.metrics.before =
            snapshot;

          state.metrics.after =
            null;

          state.metrics
            .peakMemoryByService =
            {};
        }

        if (phase === "after") {
          state.metrics.after =
            snapshot;
        }

        updateMetricPeaks(
          snapshot
        );

        return snapshot;
      } finally {
        metricsLoading =
          false;
      }
    }


    async function initialize() {
      if (
        state.initialized ||
        state.initializing
      ) {
        return;
      }

      state.initializing =
        true;

      state.error =
        null;

      try {
        const [
          config
        ] = await Promise.all([
          fetchJson(
            "/api/demo/config"
          ),

          sampleMetrics(
            "current"
          )
        ]);

        state.config =
          config;

        state.initialized =
          true;
      } catch (error) {
        state.error =
          error.message;
      } finally {
        state.initializing =
          false;
      }
    }


    function mergeTrace(
      record,
      trace
    ) {
      record.trace =
        trace;

      record.traceError =
        null;

      if (
        Array.isArray(
          trace.stages
        )
      ) {
        record.stages =
          trace.stages;
      }

      if (
        trace.status ===
        "RUNNING"
      ) {
        record.status =
          "RUNNING";
      }

      if (
        trace.status ===
        "COMPLETED"
      ) {
        record.status =
          "COMPLETED";

        record.completedAt =
          trace.completedAt;

        record.durationMs =
          trace.durationMs;

        record.technicalDurationMs =
          trace.technicalDurationMs;
      }

      if (
        trace.status ===
        "FAILED"
      ) {
        record.status =
          "FAILED";

        record.completedAt =
          trace.failedAt;

        record.durationMs =
          trace.durationMs;

        record.technicalDurationMs =
          trace.technicalDurationMs;
      }
    }


    async function refreshTrace(
      record
    ) {
      try {
        const trace =
          await fetchJson(
            "/api/demo/traces/" +
            encodeURIComponent(
              record.requestId
            )
          );

        mergeTrace(
          record,
          trace
        );

        return trace;
      } catch (error) {
        if (
          error.status !== 404
        ) {
          record.traceError =
            error.message;
        }

        return null;
      }
    }


    async function executeRequest(
      index,
      batchId
    ) {
      const requestId =
        `DEMO-UI-${Date.now()}-` +
        `${index}-` +
        createShortIdentifier();

      const experimentId =
        `DEMO-UI-${batchId}`;

      const record =
        createRequestRecord({
          requestId,
          experimentId,
          batchId,
          index
        });

      record.status =
        "SUBMITTING";

      record.startedAt =
        new Date()
          .toISOString();

      state.requests.unshift(
        record
      );

      if (
        !state.selectedRequestId
      ) {
        state.selectedRequestId =
          requestId;
      }

      let continuePolling =
        true;

      const pollPromise =
        (
          async () => {
            while (
              continuePolling
            ) {
              await refreshTrace(
                record
              );

              await wait(
                clamp(
                  state.controls
                    .metricsSamplingMs /
                    2,
                  150,
                  1000
                )
              );
            }
          }
        )();

      try {
        const result =
          await fetchJson(
            "/api/demo/simulate",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  requestId,
                  experimentId,
                  demoDelayMs:
                    clamp(
                      state.controls
                        .demoDelayMs,
                      0,
                      state.config
                        ?.maximumDelayMs ??
                      2000
                    )
                })
            }
          );

        record.result =
          result;

        record.status =
          result.status ===
          "SUCCESS"
            ? "COMPLETED"
            : "FAILED";

        record.completedAt =
          result.timestamp ??
          new Date()
            .toISOString();

        record.durationMs =
          result.durationMs ??
          null;

        record.technicalDurationMs =
          result
            .technicalDurationMs ??
          null;
      } catch (error) {
        record.status =
          "FAILED";

        record.completedAt =
          new Date()
            .toISOString();

        record.error = {
          message:
            error.message,

          status:
            error.status ??
            null,

          payload:
            error.payload ??
            null
        };
      } finally {
        continuePolling =
          false;

        await pollPromise;

        await refreshTrace(
          record
        );
      }
    }


    function startMetricsSampling() {
      stopMetricsSampling();

      const intervalMs =
        clamp(
          state.controls
            .metricsSamplingMs,
          300,
          3000
        );

      metricsTimer =
        setInterval(
          () => {
            sampleMetrics(
              "current"
            ).catch(
              (error) => {
                state.error =
                  error.message;
              }
            );
          },
          intervalMs
        );
    }


    function stopMetricsSampling() {
      if (metricsTimer) {
        clearInterval(
          metricsTimer
        );

        metricsTimer =
          null;
      }
    }


    async function startBatch() {
      if (state.running) {
        return;
      }

      await initialize();

      if (!state.initialized) {
        return;
      }

      state.error =
        null;

      stopRequested =
        false;

      state.stopping =
        false;

      state.running =
        true;

      const requestCount =
        clamp(
          state.controls
            .requestCount,
          1,
          state.config
            ?.maximumRecommendedRequests ??
          20
        );

      const concurrency =
        clamp(
          state.controls
            .concurrency,
          1,
          Math.min(
            requestCount,
            state.config
              ?.maximumRecommendedConcurrency ??
            5
          )
        );

      state.controls.requestCount =
        requestCount;

      state.controls.concurrency =
        concurrency;

      const batchId =
        `${Date.now()}-` +
        createShortIdentifier();

      state.batch = {
        id:
          batchId,

        startedAt:
          new Date()
            .toISOString(),

        completedAt:
          null,

        total:
          requestCount,

        skipped:
          0
      };

      state.selectedRequestId =
        null;

      try {
        await sampleMetrics(
          "before"
        );

        startMetricsSampling();

        let nextIndex =
          1;

        async function worker() {
          while (
            nextIndex <=
            requestCount
          ) {
            if (stopRequested) {
              return;
            }

            const currentIndex =
              nextIndex;

            nextIndex += 1;

            await executeRequest(
              currentIndex,
              batchId
            );
          }
        }

        await Promise.all(
          Array.from(
            {
              length:
                concurrency
            },
            () =>
              worker()
          )
        );

        state.batch.skipped =
          Math.max(
            requestCount -
            currentBatchRequests
              .value.length,
            0
          );
      } catch (error) {
        state.error =
          error.message;
      } finally {
        stopMetricsSampling();

        try {
          await sampleMetrics(
            "after"
          );
        } catch (error) {
          state.error =
            error.message;
        }

        state.batch.completedAt =
          new Date()
            .toISOString();

        state.running =
          false;

        state.stopping =
          false;
      }
    }


    function stopBatch() {
      if (!state.running) {
        return;
      }

      stopRequested =
        true;

      state.stopping =
        true;
    }


    function resetDemo() {
      if (state.running) {
        return;
      }

      state.error =
        null;

      state.requests =
        [];

      state.selectedRequestId =
        null;

      state.batch = {
        id:
          null,

        startedAt:
          null,

        completedAt:
          null,

        total:
          0,

        skipped:
          0
      };

      state.metrics.before =
        null;

      state.metrics.after =
        null;

      state.metrics
        .peakMemoryByService =
        {};
    }


    function selectRequest(
      requestId
    ) {
      state.selectedRequestId =
        requestId;
    }


    function statusLabel(
      status
    ) {
      const labels = {
        PENDING:
          "En attente",

        SUBMITTING:
          "Envoi",

        RUNNING:
          "En cours",

        COMPLETED:
          "Terminé",

        FAILED:
          "Échec"
      };

      return (
        labels[status] ||
        status ||
        "Inconnu"
      );
    }


    function formatNumber(
      value,
      precision = 3
    ) {
      const number =
        Number(value);

      if (!Number.isFinite(number)) {
        return "—";
      }

      return new Intl.NumberFormat(
        "fr-FR",
        {
          minimumFractionDigits:
            0,

          maximumFractionDigits:
            precision
        }
      ).format(number);
    }


    function formatDate(
      value
    ) {
      if (!value) {
        return "—";
      }

      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return String(value);
      }

      return new Intl.DateTimeFormat(
        "fr-FR",
        {
          dateStyle:
            "short",

          timeStyle:
            "medium"
        }
      ).format(date);
    }


    function formatJson(
      value
    ) {
      if (
        value === null ||
        value === undefined
      ) {
        return "Non disponible";
      }

      return JSON.stringify(
        value,
        null,
        2
      );
    }


    function dispose() {
      stopRequested =
        true;

      stopMetricsSampling();
    }


    onMounted(
      initialize
    );

    onBeforeUnmount(
      dispose
    );


    return {
      state,
      batchSummary,
      metricRows,
      metricsSummary,
      selectedRequest,
      currentBatchRequests,
      initialize,
      startBatch,
      stopBatch,
      resetDemo,
      selectRequest,
      statusLabel,
      formatNumber,
      formatDate,
      formatJson
    };
  },


  template: `
    <section class="live-demo-page">
      <aside class="demo-scientific-warning">
        <strong>
          Démonstration opérationnelle isolée
        </strong>

        <p>
          Les requêtes exécutées ici ne modifient ni les
          douze exécutions officielles, ni les résultats H1/H2,
          ni les fichiers présents dans le répertoire
          scientifique final.
        </p>
      </aside>


      <section class="demo-control-panel">
        <div class="demo-control-heading">
          <div>
            <p class="eyebrow">
              Commande du workflow
            </p>

            <h3>
              POST /smartgrid/simulate
            </h3>

            <p>
              Lance une ou plusieurs requêtes et observe leur
              passage dans les cinq services.
            </p>
          </div>

          <span
            class="demo-runtime-status"
            :class="{
              running: state.running,
              stopped: !state.running
            }"
          >
            {{
              state.running
                ? "Lot en cours"
                : "Prêt"
            }}
          </span>
        </div>


        <div class="demo-controls-grid">
          <label>
            <span>Nombre de requêtes</span>

            <input
              v-model.number="
                state.controls.requestCount
              "
              type="number"
              min="1"
              :max="
                state.config
                  ?.maximumRecommendedRequests ??
                20
              "
              :disabled="state.running"
            >
          </label>

          <label>
            <span>Concurrence</span>

            <input
              v-model.number="
                state.controls.concurrency
              "
              type="number"
              min="1"
              :max="
                state.config
                  ?.maximumRecommendedConcurrency ??
                5
              "
              :disabled="state.running"
            >
          </label>

          <label>
            <span>Délai visuel par étape</span>

            <select
              v-model.number="
                state.controls.demoDelayMs
              "
              :disabled="state.running"
            >
              <option :value="0">
                Aucun délai
              </option>

              <option :value="250">
                250 ms
              </option>

              <option :value="600">
                600 ms
              </option>

              <option :value="1000">
                1 seconde
              </option>
            </select>
          </label>

          <label>
            <span>Échantillonnage métriques</span>

            <select
              v-model.number="
                state.controls.metricsSamplingMs
              "
              :disabled="state.running"
            >
              <option :value="500">
                500 ms
              </option>

              <option :value="1000">
                1 seconde
              </option>

              <option :value="2000">
                2 secondes
              </option>
            </select>
          </label>
        </div>


        <div class="demo-control-actions">
          <button
            class="demo-primary-button"
            type="button"
            :disabled="
              state.running ||
              state.initializing
            "
            @click="startBatch"
          >
            {{
              state.initializing
                ? "Initialisation..."
                : "Lancer la démonstration"
            }}
          </button>

          <button
            class="demo-stop-button"
            type="button"
            :disabled="
              !state.running ||
              state.stopping
            "
            @click="stopBatch"
          >
            {{
              state.stopping
                ? "Arrêt demandé"
                : "Arrêter les nouveaux lancements"
            }}
          </button>

          <button
            class="demo-secondary-button"
            type="button"
            :disabled="state.running"
            @click="resetDemo"
          >
            Réinitialiser l’affichage
          </button>
        </div>
      </section>


      <aside
        v-if="state.error"
        class="demo-error-panel"
      >
        <strong>
          Erreur de démonstration
        </strong>

        <p>
          {{ state.error }}
        </p>
      </aside>


      <section class="demo-summary-grid">
        <article>
          <span>Prévues</span>

          <strong>
            {{ batchSummary.planned }}
          </strong>
        </article>

        <article>
          <span>En cours</span>

          <strong>
            {{ batchSummary.running }}
          </strong>
        </article>

        <article>
          <span>Terminées</span>

          <strong>
            {{ batchSummary.completed }}
          </strong>
        </article>

        <article>
          <span>Échecs</span>

          <strong>
            {{ batchSummary.failed }}
          </strong>
        </article>

        <article>
          <span>Non lancées</span>

          <strong>
            {{ batchSummary.skipped }}
          </strong>
        </article>

        <article>
          <span>Durée technique moyenne</span>

          <strong>
            {{
              formatNumber(
                batchSummary
                  .meanTechnicalDurationMs
              )
            }}
            ms
          </strong>
        </article>
      </section>


      <section class="demo-metrics-panel">
        <div class="demo-section-heading">
          <div>
            <p class="eyebrow">
              Ressources en direct
            </p>

            <h3>
              Consommation pendant le lot
            </h3>
          </div>

          <span>
            Échantillon :
            {{
              formatDate(
                state.metrics.sampledAt
              )
            }}
          </span>
        </div>


        <div class="demo-metrics-summary">
          <article>
            <span>Delta CPU cumulé</span>

            <strong>
              {{
                formatNumber(
                  metricsSummary.cpuDelta,
                  6
                )
              }}
              s
            </strong>
          </article>

          <article>
            <span>RAM actuelle</span>

            <strong>
              {{
                formatNumber(
                  metricsSummary.memoryMiB
                )
              }}
              MiB
            </strong>
          </article>

          <article>
            <span>Pic RAM échantillonné</span>

            <strong>
              {{
                formatNumber(
                  metricsSummary
                    .peakMemoryMiB
                )
              }}
              MiB
            </strong>
          </article>

          <article>
            <span>Passages métier cumulés</span>

            <strong>
              {{
                formatNumber(
                  metricsSummary
                    .workflowDelta,
                  0
                )
              }}
            </strong>
          </article>
        </div>


        <div class="demo-table-wrapper">
          <table class="demo-metrics-table">
            <thead>
              <tr>
                <th>Service</th>
                <th>État</th>
                <th>Delta CPU</th>
                <th>RAM actuelle</th>
                <th>Pic RAM</th>
                <th>Requêtes métier</th>
                <th>HTTP global</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="service in metricRows"
                :key="service.id"
              >
                <td>
                  <strong>
                    {{ service.label }}
                  </strong>
                </td>

                <td>
                  <span
                    class="demo-service-status"
                    :class="
                      service.status
                        .toLowerCase()
                    "
                  >
                    {{ service.status }}
                  </span>
                </td>

                <td>
                  {{
                    formatNumber(
                      service.cpuDelta,
                      6
                    )
                  }}
                  s
                </td>

                <td>
                  {{
                    formatNumber(
                      service.memoryMiB
                    )
                  }}
                  MiB
                </td>

                <td>
                  {{
                    formatNumber(
                      service.peakMemoryMiB
                    )
                  }}
                  MiB
                </td>

                <td>
                  <strong>
                    +{{
                      formatNumber(
                        service.workflowDelta,
                        0
                      )
                    }}
                  </strong>
                </td>

                <td>
                  +{{
                    formatNumber(
                      service.globalHttpDelta,
                      0
                    )
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="demo-metrics-note">
          Le delta CPU représente le temps CPU cumulé du
          processus entre les échantillons. La RAM correspond
          à une observation instantanée. Le compteur métier
          exclut les routes /health et /metrics.
        </p>
      </section>


      <section class="demo-workflow-layout">
        <div class="demo-request-history">
          <div class="demo-section-heading">
            <div>
              <p class="eyebrow">
                Historique
              </p>

              <h3>
                Requêtes exécutées
              </h3>
            </div>

            <span>
              {{ state.requests.length }}
              requête(s)
            </span>
          </div>


          <div
            v-if="state.requests.length"
            class="demo-request-list"
          >
            <button
              v-for="request in state.requests"
              :key="request.requestId"
              class="demo-request-card"
              :class="{
                selected:
                  request.requestId ===
                  state.selectedRequestId
              }"
              type="button"
              @click="
                selectRequest(
                  request.requestId
                )
              "
            >
              <div>
                <strong>
                  Requête {{ request.index }}
                </strong>

                <span>
                  {{ request.requestId }}
                </span>
              </div>

              <div>
                <span
                  class="demo-status-badge"
                  :class="
                    request.status
                      .toLowerCase()
                  "
                >
                  {{
                    statusLabel(
                      request.status
                    )
                  }}
                </span>

                <small>
                  {{
                    formatNumber(
                      request
                        .technicalDurationMs
                    )
                  }}
                  ms
                </small>
              </div>

              <p>
                {{
                  request.result
                    ?.optimization
                    ?.decision ??
                  request.trace
                    ?.finalResult
                    ?.optimization
                    ?.decision ??
                  "Décision en attente"
                }}
              </p>
            </button>
          </div>

          <p
            v-else
            class="empty-state"
          >
            Aucune requête de démonstration n’a encore été
            exécutée.
          </p>
        </div>


        <article
          v-if="selectedRequest"
          class="demo-trace-panel"
        >
          <header class="demo-trace-header">
            <div>
              <p class="eyebrow">
                Trace sélectionnée
              </p>

              <h3>
                {{ selectedRequest.requestId }}
              </h3>

              <p>
                Début :
                {{
                  formatDate(
                    selectedRequest.startedAt
                  )
                }}
              </p>
            </div>

            <span
              class="demo-status-badge"
              :class="
                selectedRequest.status
                  .toLowerCase()
              "
            >
              {{
                statusLabel(
                  selectedRequest.status
                )
              }}
            </span>
          </header>


          <div class="demo-duration-grid">
            <article>
              <span>Durée globale</span>

              <strong>
                {{
                  formatNumber(
                    selectedRequest
                      .durationMs
                  )
                }}
                ms
              </strong>
            </article>

            <article>
              <span>Durée technique</span>

              <strong>
                {{
                  formatNumber(
                    selectedRequest
                      .technicalDurationMs
                  )
                }}
                ms
              </strong>
            </article>

            <article>
              <span>Délai visuel</span>

              <strong>
                {{
                  formatNumber(
                    selectedRequest
                      .result
                      ?.demoDelayMs ??
                    selectedRequest
                      .trace
                      ?.demoDelayMs,
                    0
                  )
                }}
                ms
              </strong>
            </article>
          </div>


          <div class="demo-stage-flow">
            <article
              v-for="stage in selectedRequest.stages"
              :key="stage.id"
              class="demo-stage-card"
              :class="
                stage.status
                  .toLowerCase()
              "
            >
              <header>
                <span>
                  {{ stage.order }}
                </span>

                <div>
                  <strong>
                    {{ stage.label }}
                  </strong>

                  <small>
                    {{
                      statusLabel(
                        stage.status
                      )
                    }}
                  </small>
                </div>
              </header>

              <p>
                Durée :
                <strong>
                  {{
                    formatNumber(
                      stage.durationMs
                    )
                  }}
                  ms
                </strong>
              </p>

              <details
                v-if="
                  stage.input ||
                  stage.output ||
                  stage.error
                "
              >
                <summary>
                  Données de l’étape
                </summary>

                <div
                  v-if="stage.input"
                  class="demo-json-block"
                >
                  <span>Entrée</span>

                  <pre>{{
                    formatJson(
                      stage.input
                    )
                  }}</pre>
                </div>

                <div
                  v-if="stage.output"
                  class="demo-json-block"
                >
                  <span>Sortie</span>

                  <pre>{{
                    formatJson(
                      stage.output
                    )
                  }}</pre>
                </div>

                <div
                  v-if="stage.error"
                  class="demo-json-block error"
                >
                  <span>Erreur</span>

                  <pre>{{
                    formatJson(
                      stage.error
                    )
                  }}</pre>
                </div>
              </details>
            </article>
          </div>


          <section
            v-if="
              selectedRequest.result ||
              selectedRequest.trace
                ?.finalResult
            "
            class="demo-final-result"
          >
            <div class="demo-section-heading">
              <div>
                <p class="eyebrow">
                  Résultat
                </p>

                <h3>
                  Décision finale
                </h3>
              </div>
            </div>

            <div class="demo-result-grid">
              <article>
                <span>Capteur</span>

                <strong>
                  {{
                    selectedRequest.result
                      ?.measurement
                      ?.sensorId ??
                    selectedRequest.trace
                      ?.finalResult
                      ?.measurement
                      ?.sensorId ??
                    "—"
                  }}
                </strong>
              </article>

              <article>
                <span>Consommation</span>

                <strong>
                  {{
                    formatNumber(
                      selectedRequest.result
                        ?.measurement
                        ?.consumption ??
                      selectedRequest.trace
                        ?.finalResult
                        ?.measurement
                        ?.consumption
                    )
                  }}
                </strong>
              </article>

              <article>
                <span>Production</span>

                <strong>
                  {{
                    formatNumber(
                      selectedRequest.result
                        ?.measurement
                        ?.production ??
                      selectedRequest.trace
                        ?.finalResult
                        ?.measurement
                        ?.production
                    )
                  }}
                </strong>
              </article>

              <article>
                <span>Bilan</span>

                <strong>
                  {{
                    formatNumber(
                      selectedRequest.result
                        ?.processing
                        ?.result
                        ?.balance ??
                      selectedRequest.trace
                        ?.finalResult
                        ?.processing
                        ?.result
                        ?.balance
                    )
                  }}
                </strong>
              </article>

              <article>
                <span>État de charge</span>

                <strong>
                  {{
                    selectedRequest.result
                      ?.processing
                      ?.result
                      ?.loadStatus ??
                    selectedRequest.trace
                      ?.finalResult
                      ?.processing
                      ?.result
                      ?.loadStatus ??
                    "—"
                  }}
                </strong>
              </article>

              <article class="demo-decision-card">
                <span>Décision</span>

                <strong>
                  {{
                    selectedRequest.result
                      ?.optimization
                      ?.decision ??
                    selectedRequest.trace
                      ?.finalResult
                      ?.optimization
                      ?.decision ??
                    "—"
                  }}
                </strong>
              </article>
            </div>
          </section>


          <aside
            v-if="
              selectedRequest.error ||
              selectedRequest.traceError
            "
            class="demo-error-panel"
          >
            <strong>
              Erreur associée à la requête
            </strong>

            <pre>{{
              formatJson(
                selectedRequest.error ??
                selectedRequest.traceError
              )
            }}</pre>
          </aside>
        </article>


        <article
          v-else
          class="demo-trace-panel demo-trace-empty"
        >
          <p>
            Sélectionne une requête afin de consulter le détail
            de son parcours.
          </p>
        </article>
      </section>
    </section>
  `
};
