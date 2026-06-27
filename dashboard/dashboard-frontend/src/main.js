import {
  computed,
  createApp,
  onMounted,
  reactive
} from "vue/dist/vue.esm-bundler.js";

import {
  buildDashboardViewModel,
  getVerdictMetadata,
  loadDashboardData
} from "./dashboard-model.mjs";

import "./style.css";


function resolveApiBaseUrl() {
  const configuredUrl =
    import.meta.env.VITE_API_BASE_URL
      ?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(
      /\/+$/,
      ""
    );
  }

  return (
    `${window.location.protocol}//` +
    `${window.location.hostname}:30574`
  );
}


function formatDate(value) {
  if (!value) {
    return "Non disponible";
  }

  const date = new Date(value);

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
      dateStyle: "medium",
      timeStyle: "medium"
    }
  ).format(date);
}


function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return new Intl.NumberFormat(
    "fr-FR",
    {
      maximumFractionDigits: 3
    }
  ).format(number);
}


function formatMetricValue(
  value,
  unit
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Non disponible";
  }

  if (
    typeof value === "boolean"
  ) {
    return value
      ? "Oui"
      : "Non";
  }

  const formattedNumber =
    formatNumber(value);

  const displayedValue =
    formattedNumber ??
    String(value);

  return unit
    ? `${displayedValue} ${unit}`
    : displayedValue;
}


function formatIdentifier(value) {
  return String(
    value ?? ""
  )
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}


createApp({
  setup() {
    const apiBaseUrl =
      resolveApiBaseUrl();



    const navigationItems = [
      {
        id: "overview",
        label: "Vue d’ensemble",
        title: "Vue d’ensemble",
        eyebrow: "Pilotage scientifique",
        description:
          "Synthèse de l’état de la plateforme, " +
          "des exécutions officielles et des " +
          "hypothèses de recherche.",
        enabled: true
      },
      {
        id: "microservices",
        label: "Microservices",
        title: "Microservices et Kubernetes",
        eyebrow: "Infrastructure",
        description:
          "État des Deployments, des Pods et " +
          "des composants déployés dans le cluster.",
        enabled: true
      },
      {
        id: "hypotheses",
        label: "Hypothèses",
        title: "Hypothèses H1 et H2",
        eyebrow: "Validation scientifique",
        description:
          "Critères, scénarios, valeurs observées " +
          "et verdicts scientifiques.",
        enabled: true
      },
      {
        id: "experiments",
        label: "Expériences",
        title: "Expériences officielles",
        eyebrow: "Résultats individuels",
        description:
          "Consultation des douze exécutions " +
          "officielles et de leurs métriques.",
        enabled: true
      },
      {
        id: "synthesis",
        label: "Synthèse",
        title: "Synthèse expérimentale",
        eyebrow: "Analyse consolidée",
        description:
          "Résultats consolidés, statistiques " +
          "et décisions relatives aux hypothèses.",
        enabled: true
      },
      {
        id: "exports",
        label: "Exports",
        title: "Exports scientifiques",
        eyebrow: "Traçabilité",
        description:
          "Accès aux résultats structurés et aux " +
          "contrôles d’intégrité.",
        enabled: true
      }
    ];
    const state = reactive({
      activePage:
        "overview",

      loading:
        false,

      errors:
        [],

      viewModel:
        buildDashboardViewModel(),

      lastRefresh:
        null
    });


    const model =
      computed(
        () => state.viewModel
      );



    const currentPage =
      computed(
        () =>
          navigationItems.find(
            (item) =>
              item.id ===
              state.activePage
          ) ??
          navigationItems[0]
      );


    const exportsLinks =
      computed(
        () => ({
          json:
            `${apiBaseUrl}` +
            "/api/experiments/export/json",

          csv:
            `${apiBaseUrl}` +
            "/api/experiments/export/csv",

          markdown:
            `${apiBaseUrl}` +
            "/api/experiments/export/markdown"
        })
      );



    function formatFileSize(
      bytes
    ) {
      const value =
        Number(bytes);

      if (
        !Number.isFinite(value) ||
        value < 0
      ) {
        return "Non disponible";
      }

      if (value < 1024) {
        return `${value} octets`;
      }

      if (value < 1024 * 1024) {
        return `${
          (value / 1024).toFixed(1)
        } Kio`;
      }

      return `${
        (
          value /
          (1024 * 1024)
        ).toFixed(2)
      } Mio`;
    }


    function selectPage(pageId) {
      const page =
        navigationItems.find(
          (item) =>
            item.id === pageId
        );

      if (
        !page ||
        page.enabled !== true
      ) {
        return;
      }

      state.activePage =
        page.id;

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }


    async function refreshDashboard() {
      state.loading = true;

      try {
        const result =
          await loadDashboardData({
            apiBaseUrl
          });

        state.viewModel =
          result.viewModel;

        state.errors =
          result.errors;

        state.lastRefresh =
          new Date().toISOString();
      } catch (error) {
        state.errors = [
          {
            key:
              "dashboard",

            endpoint:
              "chargement global",

            message:
              error.message
          }
        ];
      } finally {
        state.loading = false;
      }
    }


    function verdictMetadata(
      verdict
    ) {
      return getVerdictMetadata(
        verdict
      );
    }


    onMounted(
      refreshDashboard
    );


    return {
      apiBaseUrl,
      currentPage,
      exportsLinks,
      navigationItems,
      formatDate,
      formatFileSize,
      formatIdentifier,
      formatMetricValue,
      model,
      refreshDashboard,
      selectPage,
      state,
      verdictMetadata
    };
  },


  template: `
    <div class="application-shell">
      <header class="dashboard-header">
        <div>
          <p class="eyebrow">
            Plateforme Smart Grid DevOps
          </p>

          <h1>
            Dashboard scientifique
          </h1>

          <p class="header-description">
            Consultation en lecture seule des preuves
            expérimentales, des hypothèses H1 et H2
            et de l'état Kubernetes.
          </p>
        </div>

        <button
          class="refresh-button"
          type="button"
          :disabled="state.loading"
          @click="refreshDashboard"
        >
          {{
            state.loading
              ? "Actualisation..."
              : "Actualiser"
          }}
        </button>      </header>


      <nav
        class="dashboard-navigation"
        aria-label="Navigation principale"
      >
        <div class="navigation-inner">
          <button
            v-for="item in navigationItems"
            :key="item.id"
            class="navigation-button"
            :class="{
              active:
                state.activePage === item.id,
              pending:
                !item.enabled
            }"
            type="button"
            :disabled="!item.enabled"
            :aria-current="
              state.activePage === item.id
                ? 'page'
                : undefined
            "
            @click="selectPage(item.id)"
          >
            <span>
              {{ item.label }}
            </span>

            <small v-if="!item.enabled">
              À valider
            </small>
          </button>
        </div>
      </nav>


      <main class="dashboard-content">
        <section class="page-introduction">
          <div>
            <p class="eyebrow">
              {{ currentPage.eyebrow }}
            </p>

            <h2>
              {{ currentPage.title }}
            </h2>

            <p>
              {{ currentPage.description }}
            </p>
          </div>

          <span class="readonly-badge">
            Lecture seule
          </span>
        </section>
        <section class="status-strip">
          <div class="status-item">
            <span class="status-label">
              API
            </span>

            <strong>
              {{ model.serviceStatus }}
            </strong>
          </div>

          <div class="status-item">
            <span class="status-label">
              Stockage
            </span>

            <strong>
              {{ model.storageMode }}
            </strong>
          </div>

          <div class="status-item">
            <span class="status-label">
              Mode
            </span>

            <strong>
              {{
                model.actionsEnabled
                  ? "Actions autorisées"
                  : "Lecture seule"
              }}
            </strong>
          </div>

          <div class="status-item">
            <span class="status-label">
              Dernière actualisation
            </span>

            <strong>
              {{
                formatDate(
                  state.lastRefresh
                )
              }}
            </strong>
          </div>
        </section>


        <aside
          v-if="state.errors.length"
          class="error-panel"
        >
          <h2>
            Données partiellement disponibles
          </h2>

          <p>
            Le Dashboard reste utilisable, mais certaines
            sources n'ont pas pu être chargées.
          </p>

          <ul>
            <li
              v-for="error in state.errors"
              :key="error.key"
            >
              <strong>
                {{ error.key }}
              </strong>
              — {{ error.message }}
            </li>
          </ul>
        </aside>


        <section
          v-if="state.activePage === 'overview'"
          class="summary-grid"
        >
          <article class="summary-card">
            <span class="summary-label">
              Exécutions évaluées
            </span>

            <strong class="summary-value">
              {{ model.totalRunsEvaluated }}
            </strong>

            <span class="summary-caption">
              Résultats conformes au schéma scientifique
            </span>
          </article>

          <article class="summary-card">
            <span class="summary-label">
              Deployments Kubernetes
            </span>

            <strong class="summary-value">
              {{
                model.kubernetes
                  .totalDeployments
              }}
            </strong>

            <span class="summary-caption">
              {{
                model.kubernetes
                  .activeDeployments
              }}
              actif(s)
            </span>
          </article>

          <article class="summary-card">
            <span class="summary-label">
              Pods
            </span>

            <strong class="summary-value">
              {{
                model.kubernetes
                  .totalPods
              }}
            </strong>

            <span class="summary-caption">
              {{
                model.kubernetes
                  .runningPods
              }}
              en exécution
            </span>
          </article>

          <article class="summary-card">
            <span class="summary-label">
              Redémarrages
            </span>

            <strong class="summary-value">
              {{
                model.kubernetes
                  .totalRestarts
              }}
            </strong>

            <span class="summary-caption">
              Total observé dans les Pods
            </span>
          </article>
        </section>


        
        <section
          v-if="state.activePage === 'overview'"
          class="overview-hypotheses"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                Décisions scientifiques
              </p>

              <h2>
                État des hypothèses
              </h2>
            </div>
          </div>

          <div class="overview-hypotheses-grid">
            <article
              v-for="hypothesis in model.hypotheses"
              :key="hypothesis.id"
              class="overview-hypothesis-card"
            >
              <div>
                <span class="hypothesis-id">
                  {{ hypothesis.id }}
                </span>

                <h3>
                  {{ hypothesis.title }}
                </h3>
              </div>

              <span
                class="verdict-badge"
                :class="
                  'verdict-' +
                  hypothesis.tone
                "
              >
                {{ hypothesis.label }}
              </span>

              <div class="overview-run-count">
                <strong>
                  {{ hypothesis.totalValidRuns }}
                  /
                  {{ hypothesis.totalRunsFound }}
                </strong>

                <span>
                  exécutions valides
                </span>
              </div>
            </article>
          </div>
        </section>


        <section
          v-if="state.activePage === 'hypotheses'"
          class="dashboard-section"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                Validation scientifique
              </p>

              <h2>
                Hypothèses H1 et H2
              </h2>

              <p class="section-description">
                Les verdicts sont établis à partir des
                exécutions officielles, des critères
                obligatoires et des références indicatives.
              </p>
            </div>

            <div class="export-links">
              <a
                :href="exportsLinks.json"
                target="_blank"
                rel="noopener"
              >
                JSON
              </a>

              <a
                :href="exportsLinks.csv"
                target="_blank"
                rel="noopener"
              >
                CSV
              </a>

              <a
                :href="exportsLinks.markdown"
                target="_blank"
                rel="noopener"
              >
                Markdown
              </a>
            </div>
          </div>


          <aside class="scientific-reading-note">
            <strong>
              Règle de lecture
            </strong>

            <p>
              Un critère indicatif peut ne pas atteindre
              son repère sans invalider l’hypothèse lorsque
              tous les critères obligatoires et la réussite
              fonctionnelle sont satisfaits.
            </p>
          </aside>


          <div class="hypotheses-grid">
            <article
              v-for="hypothesis in model.hypotheses"
              :key="hypothesis.id"
              class="hypothesis-card detailed"
            >
              <header class="hypothesis-header">
                <div>
                  <span class="hypothesis-id">
                    {{ hypothesis.id }}
                  </span>

                  <h3>
                    {{ hypothesis.title }}
                  </h3>
                </div>

                <span
                  class="verdict-badge"
                  :class="
                    'verdict-' +
                    hypothesis.tone
                  "
                >
                  {{ hypothesis.label }}
                </span>
              </header>


              <p
                v-if="hypothesis.statement"
                class="hypothesis-statement"
              >
                {{ hypothesis.statement }}
              </p>


              <div class="hypothesis-context-grid">
                <article>
                  <span>
                    Verdict scientifique
                  </span>

                  <strong>
                    {{
                      hypothesis
                        .scientificVerdictLabel ??
                      "Non disponible"
                    }}
                  </strong>
                </article>

                <article>
                  <span>
                    Portée de validation
                  </span>

                  <strong>
                    {{
                      hypothesis
                        .validationScopeLabel ??
                      "Non disponible"
                    }}
                  </strong>
                </article>

                <article class="decision-basis-card">
                  <span>
                    Base de décision
                  </span>

                  <strong>
                    {{
                      hypothesis
                        .decisionBasisLabel ??
                      "Non disponible"
                    }}
                  </strong>
                </article>
              </div>


              <aside
                v-if="
                  hypothesis
                    .thresholdInterpretationLabel
                "
                class="threshold-interpretation"
              >
                <strong>
                  Interprétation des repères temporels
                </strong>

                <p>
                  {{
                    hypothesis
                      .thresholdInterpretationLabel
                  }}
                </p>
              </aside>


              <div class="hypothesis-statistics">
                <div>
                  <span>
                    Exécutions trouvées
                  </span>

                  <strong>
                    {{ hypothesis.totalRunsFound }}
                  </strong>
                </div>

                <div>
                  <span>
                    Exécutions valides
                  </span>

                  <strong>
                    {{ hypothesis.totalValidRuns }}
                  </strong>
                </div>

                <div>
                  <span>
                    Minimum par scénario
                  </span>

                  <strong>
                    {{
                      hypothesis
                        .minimumValidRunsPerScenario
                    }}
                  </strong>
                </div>

                <div
                  v-if="
                    hypothesis
                      .functionalSuccessRatePercent !==
                    null
                  "
                >
                  <span>
                    Réussite fonctionnelle
                  </span>

                  <strong>
                    {{
                      formatMetricValue(
                        hypothesis
                          .functionalSuccessRatePercent,
                        "%"
                      )
                    }}
                  </strong>
                </div>
              </div>


              <div
                v-if="hypothesis.components.length"
                class="subsection"
              >
                <h4>
                  Résultats consolidés de H1
                </h4>

                <div class="component-summary-grid">
                  <article
                    v-for="component in hypothesis.components"
                    :key="component.id"
                    class="component-summary-card"
                  >
                    <h5>
                      {{ component.label }}
                    </h5>

                    <dl>
                      <div>
                        <dt>Runs valides</dt>

                        <dd>
                          {{
                            component
                              .technicallyValidRuns
                          }}
                          /
                          {{
                            component.officialRuns
                          }}
                        </dd>
                      </div>

                      <div>
                        <dt>Réussite fonctionnelle</dt>

                        <dd>
                          {{
                            formatMetricValue(
                              component
                                .functionalSuccessRatePercent,
                              "%"
                            )
                          }}
                        </dd>
                      </div>

                      <div>
                        <dt>Moyenne</dt>

                        <dd>
                          {{
                            formatMetricValue(
                              component.meanSeconds,
                              "s"
                            )
                          }}
                        </dd>
                      </div>

                      <div>
                        <dt>Maximum</dt>

                        <dd>
                          {{
                            formatMetricValue(
                              component.maximumSeconds,
                              "s"
                            )
                          }}
                        </dd>
                      </div>

                      <div>
                        <dt>Référence indicative</dt>

                        <dd>
                          {{
                            formatMetricValue(
                              component.referenceSeconds,
                              "s"
                            )
                          }}
                        </dd>
                      </div>

                      <div>
                        <dt>Référence respectée</dt>

                        <dd>
                          {{
                            component.referenceMetRuns
                          }}
                          /
                          {{
                            component.officialRuns
                          }}
                        </dd>
                      </div>
                    </dl>

                    <p
                      v-if="component.decision"
                      class="component-decision"
                    >
                      {{ component.decision }}
                    </p>
                  </article>
                </div>
              </div>


              <div class="subsection">
                <h4>
                  Couverture des scénarios
                </h4>

                <div
                  v-if="hypothesis.scenarios.length"
                  class="scenario-list"
                >
                  <div
                    v-for="scenario in hypothesis.scenarios"
                    :key="scenario.id"
                    class="scenario-row detailed"
                  >
                    <div>
                      <strong>
                        {{
                          formatIdentifier(
                            scenario.id
                          )
                        }}
                      </strong>

                      <p
                        v-if="
                          scenario
                            .performanceReferenceSeconds !==
                          null
                        "
                      >
                        Référence indicative :
                        {{
                          formatMetricValue(
                            scenario
                              .performanceReferenceSeconds,
                            "s"
                          )
                        }}
                        — respectée dans
                        {{
                          scenario
                            .performanceReferenceMetRuns
                        }}
                        /
                        {{ scenario.requiredRuns }}
                        exécutions.
                      </p>

                      <p
                        v-if="
                          scenario
                            .performanceAssessment
                        "
                      >
                        {{
                          scenario
                            .performanceAssessment
                        }}
                      </p>
                    </div>

                    <strong>
                      {{ scenario.validRuns }}
                      /
                      {{ scenario.requiredRuns }}
                    </strong>

                    <span
                      class="coverage-status"
                      :class="{
                        'coverage-complete':
                          scenario.sufficient,
                        'coverage-incomplete':
                          !scenario.sufficient
                      }"
                    >
                      {{
                        scenario.sufficient
                          ? "Suffisant"
                          : "Insuffisant"
                      }}
                    </span>
                  </div>
                </div>

                <p
                  v-else
                  class="empty-state"
                >
                  Aucun scénario évalué.
                </p>
              </div>


              <div class="subsection">
                <h4>
                  Critères de validation
                </h4>

                <div
                  v-if="hypothesis.criteria.length"
                  class="table-wrapper"
                >
                  <table class="criteria-table">
                    <thead>
                      <tr>
                        <th>Critère</th>
                        <th>Nature</th>
                        <th>Métrique</th>
                        <th>Agrégation</th>
                        <th>Valeur observée</th>
                        <th>Seuil</th>
                        <th>Échantillon</th>
                        <th>Verdict</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr
                        v-for="criterion in hypothesis.criteria"
                        :key="criterion.id"
                      >
                        <td>
                          <strong>
                            {{ criterion.id }}
                          </strong>
                        </td>

                        <td>
                          <span
                            class="criterion-type"
                            :class="{
                              required:
                                criterion.required,
                              indicative:
                                !criterion.required
                            }"
                          >
                            {{
                              criterion.required
                                ? "Obligatoire"
                                : "Indicatif"
                            }}
                          </span>
                        </td>

                        <td>
                          {{
                            formatIdentifier(
                              criterion.metric
                            )
                          }}

                          <p
                            v-if="criterion.interpretation"
                            class="criterion-interpretation"
                          >
                            {{ criterion.interpretation }}
                          </p>
                        </td>

                        <td>
                          {{
                            formatIdentifier(
                              criterion.aggregation
                            )
                          }}
                        </td>

                        <td>
                          {{
                            formatMetricValue(
                              criterion.observed,
                              criterion.unit
                            )
                          }}
                        </td>

                        <td>
                          {{ criterion.operator }}
                          {{
                            formatMetricValue(
                              criterion.threshold,
                              criterion.unit
                            )
                          }}
                        </td>

                        <td>
                          {{ criterion.sampleSize }}
                        </td>

                        <td>
                          <span
                            class="verdict-badge compact"
                            :class="
                              'verdict-' +
                              verdictMetadata(
                                criterion.status
                              ).tone
                            "
                          >
                            {{
                              verdictMetadata(
                                criterion.status
                              ).label
                            }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p
                  v-else
                  class="empty-state"
                >
                  Aucun critère ne peut encore être agrégé.
                </p>
              </div>


              <div
                v-if="hypothesis.supportingMetrics.length"
                class="subsection"
              >
                <h4>
                  Métriques descriptives complémentaires
                </h4>

                <div class="supporting-metrics-grid">
                  <article
                    v-for="metric in hypothesis.supportingMetrics"
                    :key="metric.id"
                  >
                    <span>
                      {{ metric.label }}
                    </span>

                    <strong>
                      {{
                        formatMetricValue(
                          metric.value,
                          metric.unit
                        )
                      }}
                    </strong>
                  </article>
                </div>
              </div>


              <div
                v-if="hypothesis.limitations.length"
                class="subsection limitations-panel"
              >
                <h4>
                  Limites expérimentales
                </h4>

                <ul>
                  <li
                    v-for="limitation in hypothesis.limitations"
                    :key="limitation"
                  >
                    {{ limitation }}
                  </li>
                </ul>
              </div>


              <footer class="hypothesis-source">
                <span>
                  Évaluation :
                  {{
                    formatDate(
                      hypothesis.evaluatedAt
                    )
                  }}
                </span>

                <span>
                  Source :
                  <code>
                    {{
                      hypothesis.sourceSummary ??
                      "Non disponible"
                    }}
                  </code>
                </span>
              </footer>
            </article>
          </div>
        </section>


        <section
          v-if="state.activePage === 'experiments'"
          class="dashboard-section"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                Exécutions officielles
              </p>

              <h2>
                Expériences
              </h2>

              <p class="section-description">
                Consultation en lecture seule des douze
                exécutions canoniques utilisées pour
                valider H1 et H2.
              </p>
            </div>
          </div>


          <div class="experiments-summary-grid">
            <article class="summary-card">
              <span class="summary-label">
                Exécutions officielles
              </span>

              <strong class="summary-value">
                {{ model.experiments.totalRuns }}
              </strong>

              <span class="summary-caption">
                Source canonique : /api/evaluations
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Techniquement valides
              </span>

              <strong class="summary-value">
                {{
                  model.experiments
                    .technicallyValidRuns
                }}
                /
                {{ model.experiments.totalRuns }}
              </strong>

              <span class="summary-caption">
                Validité des artefacts et préconditions
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Hypothèse H1
              </span>

              <strong class="summary-value">
                {{ model.experiments.h1Runs }}
              </strong>

              <span class="summary-caption">
                Trois scénarios, trois répétitions chacun
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Hypothèse H2
              </span>

              <strong class="summary-value">
                {{ model.experiments.h2Runs }}
              </strong>

              <span class="summary-caption">
                Observabilité intégrée sous charge
              </span>
            </article>
          </div>


          <aside class="experiment-reading-note">
            <div>
              <strong>
                Source officielle
              </strong>

              <p>
                Seules les exécutions contenues dans
                <code>/api/evaluations</code> sont affichées.
                Les rapports supplémentaires de
                <code>/api/experiments</code> ne sont pas
                comptabilisés comme runs canoniques.
              </p>
            </div>

            <div>
              <strong>
                Repères temporels
              </strong>

              <p>
                {{
                  model.experiments
                    .referenceMetRuns
                }}
                /
                {{
                  model.experiments
                    .referenceApplicableRuns
                }}
                exécutions H1 ont respecté leur référence
                indicative. La réussite fonctionnelle reste
                distinguée de cette mesure de performance.
              </p>
            </div>
          </aside>


          <section
            v-for="group in model.experiments.groups"
            :key="group.id"
            class="experiment-hypothesis-group"
          >
            <div class="experiment-group-heading">
              <div>
                <span class="hypothesis-id">
                  {{ group.id }}
                </span>

                <h3>
                  {{ group.title }}
                </h3>
              </div>

              <strong>
                {{ group.runCount }} exécutions
              </strong>
            </div>


            <section
              v-for="scenario in group.scenarios"
              :key="scenario.id"
              class="experiment-scenario"
            >
              <header class="experiment-scenario-header">
                <div>
                  <h4>
                    {{ scenario.label }}
                  </h4>

                  <p>
                    {{ scenario.description }}
                  </p>
                </div>

                <span>
                  {{ scenario.runs.length }} runs
                </span>
              </header>


              <div class="experiment-run-grid">
                <article
                  v-for="run in scenario.runs"
                  :key="run.runId"
                  class="experiment-run-card"
                >
                  <header class="experiment-run-header">
                    <div>
                      <span class="run-hypothesis">
                        {{ run.hypothesisId }}
                      </span>

                      <h5>
                        {{ run.runId }}
                      </h5>
                    </div>

                    <span
                      class="verdict-badge compact"
                      :class="
                        'verdict-' +
                        run.verdictTone
                      "
                    >
                      {{ run.verdictLabel }}
                    </span>
                  </header>


                  <div class="run-status-grid">
                    <div>
                      <span>
                        Validité technique
                      </span>

                      <strong>
                        {{
                          run.technicallyValid === true
                            ? "Valide"
                            : run.technicallyValid === false
                              ? "Invalide"
                              : "Non disponible"
                        }}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Réussite fonctionnelle
                      </span>

                      <strong>
                        {{
                          run.functionalSuccess === true
                            ? "Oui"
                            : run.functionalSuccess === false
                              ? "Non"
                              : "Non applicable"
                        }}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Référence indicative
                      </span>

                      <strong>
                        {{
                          run.performanceReferenceMet === true
                            ? "Respectée"
                            : run.performanceReferenceMet === false
                              ? "Non respectée"
                              : "Non applicable"
                        }}
                      </strong>
                    </div>
                  </div>


                  <div
                    v-if="run.primaryMetric"
                    class="run-primary-metric"
                  >
                    <span>
                      {{ run.primaryMetric.label }}
                    </span>

                    <strong>
                      {{
                        formatMetricValue(
                          run.primaryMetric.value,
                          run.primaryMetric.unit
                        )
                      }}
                    </strong>
                  </div>


                  <details class="run-details">
                    <summary>
                      Métriques et traçabilité
                    </summary>

                    <div class="run-metrics-grid">
                      <div
                        v-for="metric in run.metrics"
                        :key="metric.id"
                      >
                        <span>
                          {{ metric.label }}
                        </span>

                        <strong>
                          {{
                            formatMetricValue(
                              metric.value,
                              metric.unit
                            )
                          }}
                        </strong>
                      </div>
                    </div>

                    <div class="run-traceability">
                      <p v-if="run.experimentId">
                        <strong>Expérience :</strong>
                        <code>{{ run.experimentId }}</code>
                      </p>

                      <p v-if="run.requestId">
                        <strong>Request ID :</strong>
                        <code>{{ run.requestId }}</code>
                      </p>

                      <p v-if="run.evaluationFile">
                        <strong>Évaluation :</strong>
                        <code>{{ run.evaluationFile }}</code>
                      </p>

                      <p v-if="run.sourceArtifact">
                        <strong>Artefact source :</strong>
                        <code>{{ run.sourceArtifact }}</code>
                      </p>
                    </div>
                  </details>
                </article>
              </div>
            </section>
          </section>
        </section>


        <section
          v-if="state.activePage === 'synthesis'"
          class="dashboard-section"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                Analyse consolidée
              </p>

              <h2>
                Synthèse expérimentale
              </h2>

              <p class="section-description">
                Présentation en lecture seule de la synthèse
                scientifique finale officielle.
              </p>
            </div>

            <span
              class="official-document-badge"
              :class="{
                available:
                  model.synthesis.available,
                unavailable:
                  !model.synthesis.available
              }"
            >
              {{
                model.synthesis.available
                  ? "FINAL_OFFICIAL"
                  : "INDISPONIBLE"
              }}
            </span>
          </div>


          <div
            v-if="model.synthesis.available"
          >
            <div class="synthesis-summary-grid">
              <article class="summary-card">
                <span class="summary-label">
                  Exécutions officielles
                </span>

                <strong class="summary-value">
                  {{
                    model.synthesis
                      .totalOfficialRuns
                  }}
                </strong>

                <span class="summary-caption">
                  H1 et H2
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Techniquement valides
                </span>

                <strong class="summary-value">
                  {{
                    model.synthesis
                      .totalTechnicallyValidRuns
                  }}
                  /
                  {{
                    model.synthesis
                      .totalOfficialRuns
                  }}
                </strong>

                <span class="summary-caption">
                  Exécutions canoniques
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Validité technique
                </span>

                <strong class="summary-value">
                  {{
                    formatMetricValue(
                      model.synthesis
                        .globalTechnicalValidityRatePercent,
                      "%"
                    )
                  }}
                </strong>

                <span class="summary-caption">
                  Taux global
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Hypothèses soutenues
                </span>

                <strong class="summary-value">
                  {{
                    model.synthesis.hypotheses
                      .filter(
                        hypothesis =>
                          hypothesis.verdict ===
                          "VALIDATED"
                      ).length
                  }}
                  /
                  {{
                    model.synthesis
                      .hypotheses.length
                  }}
                </strong>

                <span class="summary-caption">
                  Dans le périmètre expérimental
                </span>
              </article>
            </div>


            <section class="synthesis-scientific-chain">
              <h3>
                Chaîne de démonstration scientifique
              </h3>

              <div class="scientific-chain-flow">
                <template
                  v-for="(stage, index) in model.synthesis.chain"
                  :key="stage.id"
                >
                  <article>
                    <span>
                      {{ index + 1 }}
                    </span>

                    <strong>
                      {{ stage.label }}
                    </strong>
                  </article>

                  <div
                    v-if="
                      index <
                      model.synthesis.chain.length - 1
                    "
                    class="scientific-chain-arrow"
                    aria-hidden="true"
                  >
                    →
                  </div>
                </template>
              </div>
            </section>


            <section class="global-scientific-conclusion">
              <p class="eyebrow">
                Décision scientifique globale
              </p>

              <h3>
                Résultats soutenant H1 et H2
              </h3>

              <p>
                {{
                  model.synthesis
                    .globalConclusion
                }}
              </p>
            </section>


            <div class="synthesis-hypothesis-grid">
              <article
                v-for="hypothesis in model.synthesis.hypotheses"
                :key="hypothesis.id"
                class="synthesis-hypothesis-card"
              >
                <header>
                  <div>
                    <span class="hypothesis-id">
                      {{ hypothesis.id }}
                    </span>

                    <h3>
                      {{ hypothesis.title }}
                    </h3>
                  </div>

                  <span
                    class="verdict-badge"
                    :class="
                      'verdict-' +
                      hypothesis.verdictTone
                    "
                  >
                    {{ hypothesis.verdictLabel }}
                  </span>
                </header>

                <div class="synthesis-run-count">
                  <div>
                    <span>
                      Runs officiels
                    </span>

                    <strong>
                      {{ hypothesis.officialRuns }}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Runs techniquement valides
                    </span>

                    <strong>
                      {{
                        hypothesis
                          .technicallyValidRuns
                      }}
                    </strong>
                  </div>
                </div>

                <p class="synthesis-conclusion-text">
                  {{
                    hypothesis
                      .scientificConclusion
                  }}
                </p>

                <aside class="synthesis-scope">
                  <strong>
                    Portée
                  </strong>

                  <p>
                    {{
                      hypothesis
                        .validationScopeLabel
                    }}
                  </p>
                </aside>
              </article>
            </div>


            <div class="synthesis-results-grid">
              <section class="synthesis-result-panel">
                <header>
                  <span class="hypothesis-id">
                    H1
                  </span>

                  <h3>
                    Automatisation, résilience et scalabilité
                  </h3>
                </header>

                <div class="synthesis-metric-list">
                  <article
                    v-for="metric in model.synthesis.h1Metrics"
                    :key="metric.id"
                  >
                    <span>
                      {{ metric.label }}
                    </span>

                    <strong>
                      {{
                        formatMetricValue(
                          metric.value,
                          metric.unit
                        )
                      }}
                    </strong>

                    <p v-if="metric.note">
                      {{ metric.note }}
                    </p>
                  </article>
                </div>

                <aside class="synthesis-critical-result">
                  <strong>
                    Résultat défavorable conservé
                  </strong>

                  <p>
                    La scalabilité est fonctionnellement
                    réussie dans 3/3 exécutions, mais la
                    référence indicative de 30 secondes
                    n’est satisfaite que dans 1/3 exécution.
                  </p>
                </aside>
              </section>


              <section class="synthesis-result-panel">
                <header>
                  <span class="hypothesis-id">
                    H2
                  </span>

                  <h3>
                    Supervision et observabilité
                  </h3>
                </header>

                <div class="synthesis-metric-list">
                  <article
                    v-for="metric in model.synthesis.h2Metrics"
                    :key="metric.id"
                  >
                    <span>
                      {{ metric.label }}
                    </span>

                    <strong>
                      {{
                        formatMetricValue(
                          metric.value,
                          metric.unit
                        )
                      }}
                    </strong>

                    <p v-if="metric.note">
                      {{ metric.note }}
                    </p>
                  </article>
                </div>
              </section>
            </div>


            <section class="synthesis-limitations">
              <h3>
                Limites de généralisation
              </h3>

              <p>
                Les verdicts sont valables dans le périmètre
                expérimental défini. Ils ne constituent pas
                une validation automatique pour un cluster
                distribué de production.
              </p>

              <ul>
                <li
                  v-for="limitation in model.synthesis.limitations"
                  :key="limitation"
                >
                  {{ limitation }}
                </li>
              </ul>
            </section>


            <section class="synthesis-sources">
              <div>
                <h3>
                  Traçabilité de la synthèse
                </h3>

                <p>
                  Document généré le
                  {{
                    formatDate(
                      model.synthesis.generatedAt
                    )
                  }}.
                </p>
              </div>

              <ul>
                <li
                  v-for="artifact in model.synthesis.sourceArtifacts"
                  :key="artifact"
                >
                  <code>
                    {{ artifact }}
                  </code>
                </li>
              </ul>
            </section>
          </div>


          <p
            v-else
            class="empty-state"
          >
            La synthèse expérimentale officielle n’est pas
            disponible. Aucun verdict alternatif n’est
            calculé par le Dashboard.
          </p>
        </section>


        <section
          v-if="state.activePage === 'exports'"
          class="dashboard-section"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                Traçabilité
              </p>

              <h2>
                Exports scientifiques
              </h2>

              <p class="section-description">
                Téléchargement en lecture seule des résultats,
                évaluations et manifestes d’intégrité.
              </p>
            </div>

            <span
              class="official-document-badge"
              :class="{
                available:
                  model.exports.available,
                unavailable:
                  !model.exports.available
              }"
            >
              {{
                model.exports.available
                  ? "EXPORTS DISPONIBLES"
                  : "INDISPONIBLES"
              }}
            </span>
          </div>


          <div
            v-if="model.exports.available"
          >
            <div class="exports-summary-grid">
              <article class="summary-card">
                <span class="summary-label">
                  Exports disponibles
                </span>

                <strong class="summary-value">
                  {{ model.exports.availableItems }}
                  /
                  {{ model.exports.totalItems }}
                </strong>

                <span class="summary-caption">
                  Fichiers et exports dynamiques
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Fichiers officiels
                </span>

                <strong class="summary-value">
                  {{ model.exports.officialFiles }}
                </strong>

                <span class="summary-caption">
                  Documents stockés dans /reports
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Exports dynamiques
                </span>

                <strong class="summary-value">
                  {{ model.exports.dynamicExports }}
                </strong>

                <span class="summary-caption">
                  Construits par le Dashboard API
                </span>
              </article>

              <article class="summary-card">
                <span class="summary-label">
                  Intégrité
                </span>

                <strong class="summary-value export-integrity-value">
                  {{ model.exports.integrity.status }}
                </strong>

                <span class="summary-caption">
                  Vérification SHA-256
                </span>
              </article>
            </div>


            <aside class="exports-readonly-note">
              <strong>
                Consultation uniquement
              </strong>

              <p>
                Les téléchargements n’entraînent aucune
                régénération des résultats, aucune écriture
                dans les rapports et aucune modification
                de Kubernetes.
              </p>
            </aside>


            <section class="exports-integrity-panel">
              <div>
                <p class="eyebrow">
                  Contrôle d’intégrité
                </p>

                <h3>
                  Manifestes SHA-256
                </h3>
              </div>

              <div class="integrity-check-grid">
                <article
                  v-for="check in model.exports.integrity.checks"
                  :key="check.manifest"
                >
                  <div>
                    <strong>
                      {{ check.status }}
                    </strong>

                    <span>
                      {{
                        check.verifiedEntries
                      }}
                      /
                      {{
                        check.totalEntries
                      }}
                      fichiers vérifiés
                    </span>
                  </div>

                  <code>
                    {{ check.manifest }}
                  </code>
                </article>
              </div>
            </section>


            <section
              v-for="category in model.exports.categories"
              :key="category.id"
              class="exports-category"
            >
              <header class="exports-category-header">
                <div>
                  <h3>
                    {{ category.label }}
                  </h3>

                  <p>
                    {{ category.description }}
                  </p>
                </div>

                <span>
                  {{ category.availableItems }}
                  /
                  {{ category.items.length }}
                </span>
              </header>


              <div class="exports-category-grid">
                <article
                  v-for="item in category.items"
                  :key="item.id"
                  class="export-file-card"
                >
                  <header>
                    <div>
                      <span class="export-format-badge">
                        {{ item.format }}
                      </span>

                      <h4>
                        {{ item.label }}
                      </h4>
                    </div>

                    <span
                      class="export-status"
                      :class="{
                        available:
                          item.available,
                        unavailable:
                          !item.available
                      }"
                    >
                      {{
                        item.available
                          ? "Disponible"
                          : "Absent"
                      }}
                    </span>
                  </header>

                  <p class="export-description">
                    {{ item.description }}
                  </p>

                  <dl class="export-metadata">
                    <div>
                      <dt>Fichier</dt>
                      <dd>
                        <code>
                          {{ item.filename }}
                        </code>
                      </dd>
                    </div>

                    <div>
                      <dt>Taille</dt>
                      <dd>
                        {{
                          formatFileSize(
                            item.sizeBytes
                          )
                        }}
                      </dd>
                    </div>

                    <div>
                      <dt>Type</dt>
                      <dd>
                        {{
                          item.type ===
                          "official_file"
                            ? "Fichier officiel"
                            : "Export dynamique"
                        }}
                      </dd>
                    </div>

                    <div>
                      <dt>Source</dt>
                      <dd>
                        <code>
                          {{ item.sourcePath }}
                        </code>
                      </dd>
                    </div>
                  </dl>

                  <div
                    v-if="item.sha256"
                    class="export-hash"
                  >
                    <span>
                      SHA-256
                    </span>

                    <code>
                      {{ item.sha256 }}
                    </code>
                  </div>

                  <a
                    v-if="
                      item.available &&
                      item.downloadPath
                    "
                    class="export-download-button"
                    :href="
                      apiBaseUrl +
                      item.downloadPath
                    "
                    target="_blank"
                    rel="noopener"
                    download
                  >
                    Télécharger
                  </a>

                  <span
                    v-else
                    class="export-download-disabled"
                  >
                    Téléchargement indisponible
                  </span>
                </article>
              </div>
            </section>


            <footer class="exports-footer-note">
              <p>
                Catalogue généré le
                {{
                  formatDate(
                    model.exports.generatedAt
                  )
                }}.
              </p>

              <p>
                Statut du document scientifique :
                <strong>
                  {{ model.exports.documentStatus }}
                </strong>
              </p>
            </footer>
          </div>


          <p
            v-else
            class="empty-state"
          >
            Aucun export scientifique n’est actuellement
            disponible. Le Dashboard ne tente pas de
            régénérer les résultats.
          </p>
        </section>


<section
          v-if="state.activePage === 'microservices'"
          class="dashboard-section"
        >
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                État opérationnel
              </p>

              <h2>
                Services déployés
              </h2>
            </div>
          </div>


          <div class="microservices-summary-grid">
            <article class="summary-card">
              <span class="summary-label">
                Composants
              </span>

              <strong class="summary-value">
                {{
                  model.microservices
                    .totalServices
                }}
              </strong>

              <span class="summary-caption">
                Cinq services métier et deux composants
                expérimentaux
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Opérationnels
              </span>

              <strong class="summary-value">
                {{
                  model.microservices
                    .operationalServices
                }}
              </strong>

              <span class="summary-caption">
                Deployments et Pods disponibles
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Dégradés
              </span>

              <strong class="summary-value">
                {{
                  model.microservices
                    .degradedServices
                }}
              </strong>

              <span class="summary-caption">
                Disponibilité partielle ou Pod non prêt
              </span>
            </article>

            <article class="summary-card">
              <span class="summary-label">
                Indisponibles
              </span>

              <strong class="summary-value">
                {{
                  model.microservices
                    .unavailableServices
                }}
              </strong>

              <span class="summary-caption">
                Aucun réplica disponible
              </span>
            </article>
          </div>


          <aside class="data-scope-panel">
            <div>
              <strong>
                État actuel
              </strong>

              <p>
                Les réplicas, Pods, images et redémarrages
                proviennent de l’état Kubernetes consulté
                lors de la dernière actualisation.
              </p>
            </div>

            <div>
              <strong>
                Mesures expérimentales
              </strong>

              <p>
                Le CPU et la mémoire représentent les
                moyennes des trois exécutions officielles H2.
                Ils ne constituent pas des mesures instantanées.
              </p>
            </div>
          </aside>


          <section
            v-for="group in model.microservices.groups"
            :key="group.id"
            class="service-group"
          >
            <div class="service-group-heading">
              <h3>
                {{ group.title }}
              </h3>

              <p>
                {{ group.description }}
              </p>
            </div>


            <div class="service-card-grid">
              <article
                v-for="service in group.services"
                :key="service.id"
                class="service-card"
              >
                <header class="service-card-header">
                  <div>
                    <span class="service-code">
                      {{ service.id }}
                    </span>

                    <h3>
                      {{ service.displayName }}
                    </h3>
                  </div>

                  <span
                    class="verdict-badge compact"
                    :class="
                      'verdict-' +
                      service.statusTone
                    "
                  >
                    {{ service.statusLabel }}
                  </span>
                </header>


                <p class="service-role">
                  {{ service.role }}
                </p>


                <div class="replica-grid">
                  <div>
                    <span>Désirés</span>

                    <strong>
                      {{ service.desiredReplicas }}
                    </strong>
                  </div>

                  <div>
                    <span>Prêts</span>

                    <strong>
                      {{ service.readyReplicas }}
                    </strong>
                  </div>

                  <div>
                    <span>Disponibles</span>

                    <strong>
                      {{ service.availableReplicas }}
                    </strong>
                  </div>

                  <div>
                    <span>Redémarrages actuels</span>

                    <strong>
                      {{ service.currentRestarts }}
                    </strong>
                  </div>
                </div>


                <div class="service-subsection">
                  <h4>
                    Pods associés
                  </h4>

                  <div
                    v-if="service.pods.length"
                    class="table-wrapper"
                  >
                    <table class="pod-details-table">
                      <thead>
                        <tr>
                          <th>Pod</th>
                          <th>Phase</th>
                          <th>Ready</th>
                          <th>Nœud</th>
                          <th>Image</th>
                          <th>Redémarrages</th>
                        </tr>
                      </thead>

                      <tbody>
                        <tr
                          v-for="pod in service.pods"
                          :key="pod.name"
                        >
                          <td>
                            {{ pod.name }}
                          </td>

                          <td>
                            {{ pod.phase }}
                          </td>

                          <td>
                            {{
                              pod.ready
                                ? "Oui"
                                : "Non"
                            }}
                          </td>

                          <td>
                            {{
                              pod.nodeName ??
                              "Non disponible"
                            }}
                          </td>

                          <td class="image-cell">
                            {{
                              pod.images.length
                                ? pod.images.join(", ")
                                : "Non disponible"
                            }}
                          </td>

                          <td>
                            {{ pod.restarts }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p
                    v-else
                    class="empty-state"
                  >
                    Aucun Pod associé à ce service.
                  </p>
                </div>


                <div
                  v-if="service.resourceMetrics"
                  class="experimental-resources"
                >
                  <div class="resource-heading">
                    <div>
                      <h4>
                        Ressources expérimentales H2
                      </h4>

                      <span>
                        Moyennes consolidées
                      </span>
                    </div>

                    <span class="resource-source-badge">
                      3 runs officiels
                    </span>
                  </div>

                  <div class="resource-grid">
                    <div>
                      <span>CPU moyen</span>

                      <strong>
                        {{
                          formatMetricValue(
                            service
                              .resourceMetrics
                              .meanCpuMillicores,
                            "mCPU"
                          )
                        }}
                      </strong>
                    </div>

                    <div>
                      <span>Mémoire moyenne</span>

                      <strong>
                        {{
                          formatMetricValue(
                            service
                              .resourceMetrics
                              .meanMemoryMiB,
                            "MiB"
                          )
                        }}
                      </strong>
                    </div>

                    <div>
                      <span>Observations</span>

                      <strong>
                        {{
                          service
                            .resourceMetrics
                            .observations
                        }}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Delta des redémarrages
                      </span>

                      <strong>
                        {{
                          service
                            .resourceMetrics
                            .totalRestartDelta
                        }}
                      </strong>
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="resource-unavailable"
                >
                  Les métriques expérimentales H2 concernent
                  uniquement les cinq microservices métier.
                </div>
              </article>
            </div>
          </section>
        </section>


        <section
          v-if="state.activePage === 'overview'"
          class="source-panel"
        >
          <h2>
            Traçabilité des résultats
          </h2>

          <p>
            Les données affichées proviennent directement
            des fichiers expérimentaux présents dans
            <code>
              {{
                model.reportsDirectory ??
                "/reports"
              }}
            </code>.
            Le Dashboard ne déclenche aucune expérimentation
            et ne modifie aucune ressource Kubernetes.
          </p>

          <p class="api-reference">
            API :
            <code>{{ apiBaseUrl }}</code>
          </p>
        </section>
      </main>
    </div>
  `
}).mount("#app");
