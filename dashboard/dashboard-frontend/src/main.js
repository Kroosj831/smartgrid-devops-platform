import { createApp, ref, onMounted } from "vue";

createApp({
  setup() {
    const apiBase = `http://${window.location.hostname}:30574`;

    const loading = ref(true);
    const error = ref(null);

    const overview = ref(null);
    const pods = ref([]);
    const deployments = ref([]);
    const hpas = ref([]);
    const experiments = ref([]);

    async function fetchJson(path) {
      const response = await fetch(`${apiBase}${path}`);

      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }

      return response.json();
    }

    async function loadDashboard() {
      loading.value = true;
      error.value = null;

      try {
        const overviewData = await fetchJson("/api/overview");
        const podsData = await fetchJson("/api/kubernetes/pods");
        const deploymentsData = await fetchJson("/api/kubernetes/deployments");
        const hpaData = await fetchJson("/api/kubernetes/hpa");
        const experimentsData = await fetchJson("/api/experiments");

        overview.value = overviewData;
        pods.value = podsData.pods || [];
        deployments.value = deploymentsData.deployments || [];
        hpas.value = hpaData.hpas || [];
        experiments.value = experimentsData.reports || [];
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    function statusClass(status) {
      if (status === "UP" || status === "validated" || status === "Running") {
        return "success";
      }

      if (status === "rejected" || status === "DOWN") {
        return "danger";
      }

      return "neutral";
    }

    onMounted(loadDashboard);

    return {
      apiBase,
      loading,
      error,
      overview,
      pods,
      deployments,
      hpas,
      experiments,
      loadDashboard,
      statusClass
    };
  },

  template: `
    <main class="page">
      <header class="header">
        <div>
          <h1>Smart Grid DevOps Dashboard</h1>
          <p>Tableau de bord expérimental pour la supervision et l'analyse DevOps.</p>
        </div>

        <button @click="loadDashboard">Rafraîchir</button>
      </header>

      <section v-if="loading" class="card">
        Chargement des données...
      </section>

      <section v-if="error" class="card danger-box">
        Erreur : {{ error }}
      </section>

      <section v-if="overview" class="grid">
        <div class="card">
          <h2>Plateforme</h2>
          <p><strong>Namespace :</strong> {{ overview.namespace }}</p>
          <p><strong>API :</strong> {{ apiBase }}</p>
          <p><strong>Dernière mise à jour :</strong> {{ overview.timestamp }}</p>
        </div>

        <div class="card">
          <h2>Expériences</h2>
          <p><strong>Total :</strong> {{ overview.experiments.total }}</p>
          <p><strong>Validées :</strong> {{ overview.experiments.validated }}</p>
          <p><strong>Rejetées :</strong> {{ overview.experiments.rejected }}</p>
          <p><strong>Mesurées :</strong> {{ overview.experiments.measured }}</p>
        </div>

        <div class="card">
          <h2>Services</h2>
          <div v-for="service in overview.services" :key="service.name" class="row">
            <span>{{ service.name }}</span>
            <span :class="['badge', statusClass(service.status)]">{{ service.status }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Microservices Kubernetes</h2>

        <table>
          <thead>
            <tr>
              <th>Pod</th>
              <th>Phase</th>
              <th>IP</th>
              <th>Node</th>
              <th>Restarts</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pod in pods" :key="pod.name">
              <td>{{ pod.name }}</td>
              <td><span :class="['badge', statusClass(pod.phase)]">{{ pod.phase }}</span></td>
              <td>{{ pod.podIP }}</td>
              <td>{{ pod.nodeName }}</td>
              <td>{{ pod.containers.reduce((sum, c) => sum + c.restartCount, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Deployments</h2>

        <table>
          <thead>
            <tr>
              <th>Deployment</th>
              <th>Replicas</th>
              <th>Ready</th>
              <th>Available</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="deployment in deployments" :key="deployment.name">
              <td>{{ deployment.name }}</td>
              <td>{{ deployment.replicas }}</td>
              <td>{{ deployment.readyReplicas }}</td>
              <td>{{ deployment.availableReplicas }}</td>
              <td>{{ deployment.updatedReplicas }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>HPA</h2>

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
      </section>

      <section class="card">
        <h2>Résultats expérimentaux</h2>

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
              <td>{{ report.data?.scenario || '-' }}</td>
              <td>{{ report.data?.metricName || '-' }}</td>
              <td>{{ report.data?.value ?? report.data?.p95LatencyMs ?? '-' }}</td>
              <td>{{ report.data?.threshold ?? report.data?.p95LatencyThresholdMs ?? '-' }}</td>
              <td>
                <span :class="['badge', statusClass(report.data?.status)]">
                  {{ report.data?.status || 'measured' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="links">
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
  body {
    margin: 0;
    font-family: Arial, sans-serif;
    background: #f4f6f8;
    color: #1f2937;
  }

  .page {
    max-width: 1200px;
    margin: auto;
    padding: 24px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  h1 {
    margin-bottom: 4px;
  }

  h2 {
    margin-top: 0;
  }

  button {
    border: none;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .card {
    background: white;
    border-radius: 12px;
    padding: 18px;
    margin-bottom: 16px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }

  .row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: bold;
  }

  .success {
    background: #dcfce7;
    color: #166534;
  }

  .danger {
    background: #fee2e2;
    color: #991b1b;
  }

  .neutral {
    background: #e5e7eb;
    color: #374151;
  }

  .danger-box {
    border-left: 5px solid #dc2626;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th, td {
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
    padding: 10px;
  }

  th {
    background: #f9fafb;
  }

  .links {
    margin-top: 16px;
    display: flex;
    gap: 12px;
  }

  .links a {
    text-decoration: none;
    font-weight: bold;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .header {
      display: block;
    }

    table {
      font-size: 12px;
    }
  }
`;
document.head.appendChild(style);
