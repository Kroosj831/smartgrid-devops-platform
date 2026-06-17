import { createApp, ref, onMounted } from "vue/dist/vue.esm-bundler.js";

const apiBase = `http://${window.location.hostname}:30574`;

createApp({
  setup() {
    const loading = ref(false);
    const actionLoading = ref(false);
    const message = ref("");

    const overview = ref(null);
    const pods = ref([]);
    const deployments = ref([]);
    const hpas = ref([]);
    const experiments = ref([]);
    const historyExperiments = ref([]);
    const historySnapshots = ref([]);
    const historyActions = ref([]);

    async function getJson(path) {
      const response = await fetch(`${apiBase}${path}`);

      if (!response.ok) {
        throw new Error(`${path} failed with status ${response.status}`);
      }

      return response.json();
    }

    async function postJson(path) {
      const response = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`${path} failed with status ${response.status}`);
      }

      return response.json();
    }

    async function refreshAll() {
      loading.value = true;
      message.value = "";

      try {
        const [
          overviewData,
          podsData,
          deploymentsData,
          hpaData,
          experimentsData,
          historyExperimentsData,
          snapshotsData,
          actionsData
        ] = await Promise.all([
          getJson("/api/overview"),
          getJson("/api/kubernetes/pods"),
          getJson("/api/kubernetes/deployments"),
          getJson("/api/kubernetes/hpa"),
          getJson("/api/experiments"),
          getJson("/api/history/experiments"),
          getJson("/api/history/snapshots/kubernetes"),
          getJson("/api/history/actions")
        ]);

        overview.value = overviewData;
        pods.value = podsData.pods || [];
        deployments.value = deploymentsData.deployments || [];
        hpas.value = hpaData.hpas || [];
        experiments.value = experimentsData.reports || [];
        historyExperiments.value = historyExperimentsData.results || [];
        historySnapshots.value = snapshotsData.snapshots || [];
        historyActions.value = actionsData.actions || [];
      } catch (error) {
        message.value = `Erreur de chargement : ${error.message}`;
      } finally {
        loading.value = false;
      }
    }

    async function importReports() {
      actionLoading.value = true;
      message.value = "";

      try {
        const result = await postJson("/api/history/import-reports");
        message.value = `Rapports importés avec succès : ${result.imported}`;
        await refreshAll();
      } catch (error) {
        message.value = `Erreur import rapports : ${error.message}`;
      } finally {
        actionLoading.value = false;
      }
    }

    async function saveKubernetesSnapshot() {
      actionLoading.value = true;
      message.value = "";

      try {
        const result = await postJson("/api/history/snapshots/kubernetes");
        message.value = `Snapshot Kubernetes enregistré : ${result.result.pods} pods, ${result.result.deployments} deployments, ${result.result.hpas} HPA`;
        await refreshAll();
      } catch (error) {
        message.value = `Erreur snapshot Kubernetes : ${error.message}`;
      } finally {
        actionLoading.value = false;
      }
    }

    function formatDate(value) {
      if (!value) return "-";

      try {
        return new Date(value).toLocaleString("fr-FR");
      } catch {
        return value;
      }
    }

    function formatValue(value, unit) {
      if (value === null || value === undefined) return "-";
      return `${value} ${unit || ""}`.trim();
    }

    function statusClass(status) {
      if (!status) return "badge neutral";

      const normalized = status.toLowerCase();

      if (
        normalized.includes("validated") ||
        normalized.includes("running") ||
        normalized.includes("ready") ||
        normalized.includes("up") ||
        normalized.includes("completed")
      ) {
        return "badge success";
      }

      if (
        normalized.includes("rejected") ||
        normalized.includes("failed") ||
        normalized.includes("down") ||
        normalized.includes("notready")
      ) {
        return "badge danger";
      }

      return "badge neutral";
    }

    onMounted(refreshAll);

    return {
      apiBase,
      loading,
      actionLoading,
      message,
      overview,
      pods,
      deployments,
      hpas,
      experiments,
      historyExperiments,
      historySnapshots,
      historyActions,
      refreshAll,
      importReports,
      saveKubernetesSnapshot,
      formatDate,
      formatValue,
      statusClass
    };
  },

  template: `
    <main class="page">
      <header class="header">
        <div>
          <p class="eyebrow">Smart Grid DevOps Platform</p>
          <h1>Dashboard DevOps expérimental</h1>
          <p class="subtitle">
            Supervision, centralisation et historisation des résultats expérimentaux.
          </p>
        </div>

        <div class="header-actions">
          <button @click="refreshAll" :disabled="loading || actionLoading">
            {{ loading ? "Chargement..." : "Rafraîchir" }}
          </button>
          <button class="secondary" @click="importReports" :disabled="loading || actionLoading">
            Importer les rapports JSON
          </button>
          <button class="secondary" @click="saveKubernetesSnapshot" :disabled="loading || actionLoading">
            Sauvegarder snapshot Kubernetes
          </button>
        </div>
      </header>

      <section v-if="message" class="message">
        {{ message }}
      </section>

      <section class="grid cards">
        <article class="card">
          <h2>Namespace</h2>
          <p class="big">{{ overview?.namespace || "-" }}</p>
        </article>

        <article class="card">
          <h2>Services supervisés</h2>
          <p class="big">{{ overview?.services?.length || 0 }}</p>
        </article>

        <article class="card">
          <h2>Expériences JSON</h2>
          <p class="big">{{ overview?.experiments?.total || 0 }}</p>
        </article>

        <article class="card">
          <h2>Résultats historisés</h2>
          <p class="big">{{ overview?.history?.experimentResults || 0 }}</p>
        </article>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>État des microservices</h2>
          <span>{{ overview?.timestamp ? formatDate(overview.timestamp) : "-" }}</span>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Statut</th>
                <th>HTTP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in overview?.services || []" :key="service.name">
                <td>{{ service.name }}</td>
                <td><span :class="statusClass(service.status)">{{ service.status }}</span></td>
                <td>{{ service.httpStatus || "-" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="grid">
        <article class="panel">
          <div class="panel-title">
            <h2>Pods Kubernetes</h2>
            <span>{{ pods.length }} pods</span>
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Phase</th>
                  <th>IP</th>
                  <th>Restarts</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pod in pods" :key="pod.name">
                  <td>{{ pod.name }}</td>
                  <td><span :class="statusClass(pod.phase)">{{ pod.phase }}</span></td>
                  <td>{{ pod.podIP || "-" }}</td>
                  <td>{{ pod.containers?.reduce((sum, c) => sum + c.restartCount, 0) || 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel">
          <div class="panel-title">
            <h2>Deployments</h2>
            <span>{{ deployments.length }} deployments</span>
          </div>

          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Replicas</th>
                  <th>Ready</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="deployment in deployments" :key="deployment.name">
                  <td>{{ deployment.name }}</td>
                  <td>{{ deployment.replicas }}</td>
                  <td>{{ deployment.readyReplicas }}</td>
                  <td>{{ deployment.availableReplicas }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>Horizontal Pod Autoscaler</h2>
          <span>{{ hpas.length }} HPA</span>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Min</th>
                <th>Max</th>
                <th>Current</th>
                <th>Desired</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="hpa in hpas" :key="hpa.name">
                <td>{{ hpa.name }}</td>
                <td>{{ hpa.minReplicas }}</td>
                <td>{{ hpa.maxReplicas }}</td>
                <td>{{ hpa.currentReplicas }}</td>
                <td>{{ hpa.desiredReplicas }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>Résultats expérimentaux actuels</h2>
          <span>{{ experiments.length }} fichiers JSON</span>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fichier</th>
                <th>Scénario</th>
                <th>Métrique</th>
                <th>Valeur</th>
                <th>Seuil</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="report in experiments" :key="report.file">
                <td>{{ report.file }}</td>
                <td>{{ report.data?.scenario || "-" }}</td>
                <td>{{ report.data?.metricName || report.data?.metric || "p95_latency" }}</td>
                <td>{{ formatValue(report.data?.value ?? report.data?.p95LatencyMs ?? report.data?.totalRequests, report.data?.unit) }}</td>
                <td>{{ report.data?.threshold ?? report.data?.p95LatencyThresholdMs ?? "-" }}</td>
                <td><span :class="statusClass(report.data?.status)">{{ report.data?.status || "measured" }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel highlight">
        <div class="panel-title">
          <h2>Historique des expériences</h2>
          <span>{{ historyExperiments.length }} résultats SQLite</span>
        </div>

        <p class="section-help">
          Cette section affiche les résultats expérimentaux conservés dans la base SQLite persistante.
        </p>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Source</th>
                <th>Scénario</th>
                <th>Métrique</th>
                <th>Valeur</th>
                <th>Seuil</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="result in historyExperiments" :key="result.id">
                <td>{{ result.id }}</td>
                <td>{{ result.source_file }}</td>
                <td>{{ result.scenario }}</td>
                <td>{{ result.metric_name }}</td>
                <td>{{ formatValue(result.value, result.unit) }}</td>
                <td>{{ result.threshold ?? "-" }}</td>
                <td><span :class="statusClass(result.status)">{{ result.status }}</span></td>
                <td>{{ formatDate(result.timestamp) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel highlight">
        <div class="panel-title">
          <h2>Historique Kubernetes</h2>
          <span>{{ historySnapshots.length }} lignes de snapshot</span>
        </div>

        <p class="section-help">
          Chaque snapshot conserve l’état des Pods, Deployments et HPA à un instant donné.
        </p>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Nom</th>
                <th>Statut</th>
                <th>Replicas</th>
                <th>Ready</th>
                <th>Restarts</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="snapshot in historySnapshots" :key="snapshot.id">
                <td>{{ snapshot.id }}</td>
                <td>{{ snapshot.resource_type }}</td>
                <td>{{ snapshot.name }}</td>
                <td><span :class="statusClass(snapshot.status)">{{ snapshot.status }}</span></td>
                <td>{{ snapshot.replicas ?? "-" }}</td>
                <td>{{ snapshot.ready_replicas ?? "-" }}</td>
                <td>{{ snapshot.restarts ?? "-" }}</td>
                <td>{{ formatDate(snapshot.timestamp) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel highlight">
        <div class="panel-title">
          <h2>Actions du dashboard</h2>
          <span>{{ historyActions.length }} actions</span>
        </div>

        <p class="section-help">
          Cette section journalise les actions contrôlées réalisées depuis ou via le dashboard.
        </p>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Action</th>
                <th>Cible</th>
                <th>Statut</th>
                <th>Durée</th>
                <th>Début</th>
                <th>Fin</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="action in historyActions" :key="action.id">
                <td>{{ action.id }}</td>
                <td>{{ action.action_type }}</td>
                <td>{{ action.target }}</td>
                <td><span :class="statusClass(action.status)">{{ action.status }}</span></td>
                <td>{{ action.duration_seconds }} s</td>
                <td>{{ formatDate(action.started_at) }}</td>
                <td>{{ formatDate(action.finished_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>Exports</h2>
          <span>JSON / CSV / Markdown</span>
        </div>

        <div class="exports">
          <a :href="apiBase + '/api/experiments/export/json'" target="_blank">Export JSON</a>
          <a :href="apiBase + '/api/experiments/export/csv'" target="_blank">Export CSV</a>
          <a :href="apiBase + '/api/experiments/export/markdown'" target="_blank">Export Markdown</a>
        </div>
      </section>
    </main>
  `
}).mount("#app");

const style = document.createElement("style");
style.textContent = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    background: #f4f6fb;
    color: #172033;
  }

  .page {
    max-width: 1500px;
    margin: 0 auto;
    padding: 28px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 24px;
  }

  .eyebrow {
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 12px;
    font-weight: 700;
    color: #4c5f8f;
  }

  h1 {
    margin: 0;
    font-size: 34px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
  }

  .subtitle {
    margin: 10px 0 0;
    color: #5d6780;
  }

  .header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
  }

  button, .exports a {
    border: none;
    border-radius: 10px;
    padding: 11px 14px;
    background: #1e3a8a;
    color: white;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
  }

  button.secondary {
    background: #334155;
  }

  button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .message {
    padding: 14px 16px;
    border-radius: 12px;
    background: #eef2ff;
    color: #1e3a8a;
    margin-bottom: 18px;
    font-weight: 700;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }

  .cards {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .card, .panel {
    background: white;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    padding: 18px;
    margin-bottom: 18px;
  }

  .highlight {
    border: 1px solid #c7d2fe;
    background: #fbfcff;
  }

  .big {
    font-size: 34px;
    font-weight: 800;
    margin: 12px 0 0;
    color: #1e3a8a;
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    margin-bottom: 14px;
  }

  .panel-title span {
    color: #64748b;
    font-size: 13px;
  }

  .section-help {
    color: #64748b;
    margin: 0 0 14px;
  }

  .table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th {
    text-align: left;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    padding: 10px;
    white-space: nowrap;
  }

  td {
    border-bottom: 1px solid #edf2f7;
    padding: 10px;
    vertical-align: top;
    white-space: nowrap;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 800;
  }

  .success {
    color: #166534;
    background: #dcfce7;
  }

  .danger {
    color: #991b1b;
    background: #fee2e2;
  }

  .neutral {
    color: #334155;
    background: #e2e8f0;
  }

  .exports {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  @media (max-width: 1100px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .header {
      flex-direction: column;
    }

    .header-actions {
      justify-content: flex-start;
    }
  }

  @media (max-width: 700px) {
    .cards {
      grid-template-columns: 1fr;
    }

    .page {
      padding: 16px;
    }
  }
`;
document.head.appendChild(style);
