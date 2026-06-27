const HYPOTHESIS_ORDER = [
  "H1",
  "H2"
];


const SERVICE_DEFINITIONS = [
  {
    id: "api-gateway",
    displayName: "API Gateway",
    category: "business",
    role:
      "Point d’entrée de la plateforme et orchestration " +
      "du workflow Smart Grid intégré."
  },
  {
    id: "iot-simulator",
    displayName: "IoT Simulator",
    category: "business",
    role:
      "Génération contrôlée des mesures Smart Grid simulées."
  },
  {
    id: "data-collector",
    displayName: "Data Collector",
    category: "business",
    role:
      "Réception, validation, enrichissement et conservation " +
      "temporaire des données."
  },
  {
    id: "processing-service",
    displayName: "Processing Service",
    category: "business",
    role:
      "Traitement des mesures et calcul du bilan énergétique."
  },
  {
    id: "optimization-service",
    displayName: "Optimization Service",
    category: "business",
    role:
      "Production d’une décision d’optimisation expérimentale."
  },
  {
    id: "dashboard-api",
    displayName: "Dashboard API",
    category: "experimental",
    role:
      "Agrégation en lecture seule des états Kubernetes " +
      "et des résultats expérimentaux."
  },
  {
    id: "dashboard-frontend",
    displayName: "Dashboard Frontend",
    category: "experimental",
    role:
      "Présentation scientifique, comparaison et exportation " +
      "des résultats."
  }
];


function arrayOrEmpty(value) {
  return Array.isArray(value)
    ? value
    : [];
}


function objectOrEmpty(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}


export function normalizeVerdict(value) {
  const verdict = String(
    value ?? "INDETERMINATE"
  ).toUpperCase();

  if (
    verdict === "VALIDATED" ||
    verdict === "REJECTED" ||
    verdict === "INDETERMINATE"
  ) {
    return verdict;
  }

  return "INDETERMINATE";
}


export function getVerdictMetadata(value) {
  const verdict =
    normalizeVerdict(value);

  const metadata = {
    VALIDATED: {
      label: "Validée",
      tone: "success"
    },

    REJECTED: {
      label: "Rejetée",
      tone: "danger"
    },

    INDETERMINATE: {
      label: "Indéterminée",
      tone: "warning"
    }
  };

  return {
    verdict,
    ...metadata[verdict]
  };
}


const HYPOTHESIS_TEXT_TRANSLATIONS = {
  supported:
    "Soutenue par les résultats",

  functional_validation_in_local_single_node_experimental_environment:
    "Validation fonctionnelle dans un environnement " +
    "expérimental local K3s mono-nœud",

  observability_validation_under_constant_load_in_local_single_node_experimental_environment:
    "Validation de l’observabilité sous charge constante " +
    "dans un environnement expérimental local K3s mono-nœud",

  all_nine_canonical_runs_were_technically_valid_and_functionally_successful:
    "Les neuf exécutions canoniques étaient techniquement " +
    "valides et fonctionnellement réussies.",

  all_three_canonical_runs_satisfied_acceptance_criteria_A02_to_A10:
    "Les trois exécutions canoniques ont satisfait les " +
    "critères d’acceptation A02 à A10.",

  "The temporal references are indicative and do not independently determine hypothesis validation.":
    "Les références temporelles sont indicatives et ne " +
    "déterminent pas, à elles seules, la validation de " +
    "l’hypothèse.",

  "Single-node K3s cluster":
    "Cluster K3s mono-nœud",

  "Local virtualized infrastructure":
    "Infrastructure locale virtualisée",

  "Limited number of official repetitions":
    "Nombre limité de répétitions officielles",

  "Observed variability in scaling and deployment times":
    "Variabilité observée des temps de scalabilité et de déploiement",

  functionally_validated_with_performance_variability:
    "Validation fonctionnelle avec variabilité des performances",

  validated:
    "Validée"
};


const HYPOTHESIS_COMPONENT_LABELS = {
  continuousDeployment:
    "Déploiement continu",

  failureRecovery:
    "Récupération après panne",

  dynamicScaling:
    "Scalabilité dynamique"
};


function translatedHypothesisText(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return (
    HYPOTHESIS_TEXT_TRANSLATIONS[value] ??
    String(value)
      .replaceAll("_", " ")
  );
}


function finiteNumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function buildHypothesisComponents(
  components = {}
) {
  return Object.entries(
    objectOrEmpty(
      components
    )
  ).map(
    ([
      componentId,
      componentSource
    ]) => {
      const component =
        objectOrEmpty(
          componentSource
        );

      return {
        id:
          componentId,

        label:
          HYPOTHESIS_COMPONENT_LABELS[
            componentId
          ] ??
          componentId,

        officialRuns:
          finiteNumberOrNull(
            component.officialRuns
          ),

        technicallyValidRuns:
          finiteNumberOrNull(
            component
              .technicallyValidRuns
          ),

        functionalSuccessRatePercent:
          finiteNumberOrNull(
            component
              .functionalSuccessRatePercent
          ),

        meanSeconds:
          finiteNumberOrNull(
            component.meanSeconds ??
            component.meanMttrSeconds
          ),

        medianSeconds:
          finiteNumberOrNull(
            component.medianSeconds ??
            component.medianMttrSeconds
          ),

        minimumSeconds:
          finiteNumberOrNull(
            component.minimumSeconds ??
            component.minimumMttrSeconds
          ),

        maximumSeconds:
          finiteNumberOrNull(
            component.maximumSeconds ??
            component.maximumMttrSeconds
          ),

        standardDeviationSeconds:
          finiteNumberOrNull(
            component
              .sampleStandardDeviationSeconds
          ),

        referenceSeconds:
          finiteNumberOrNull(
            component.referenceSeconds
          ),

        referenceMetRuns:
          finiteNumberOrNull(
            component.referenceMetRuns
          ),

        treeInvariant:
          typeof component.treeInvariant ===
          "boolean"
            ? component.treeInvariant
            : null,

        decision:
          translatedHypothesisText(
            component.decision
          )
      };
    }
  );
}


function buildSupportingMetrics(
  supportingMetrics = {}
) {
  const metrics =
    objectOrEmpty(
      supportingMetrics
    );

  const definitions = [
    {
      id:
        "httpFailureRatePercent",

      label:
        "Taux d’échec HTTP moyen",

      value:
        metrics.httpFailureRatePercent
          ?.mean,

      unit:
        "%"
    },
    {
      id:
        "httpLatencyAverageMilliseconds",

      label:
        "Latence HTTP moyenne",

      value:
        metrics
          .httpLatencyAverageMilliseconds
          ?.mean,

      unit:
        "ms"
    },
    {
      id:
        "httpLatencyP95Milliseconds",

      label:
        "Latence HTTP p95 moyenne",

      value:
        metrics
          .httpLatencyP95Milliseconds
          ?.mean,

      unit:
        "ms"
    },
    {
      id:
        "httpLatencyMaximumMilliseconds",

      label:
        "Latence HTTP maximale observée",

      value:
        metrics
          .httpLatencyMaximumMilliseconds
          ?.maximumObserved ??
        metrics
          .httpLatencyMaximumMilliseconds
          ?.maximum,

      unit:
        "ms"
    }
  ];

  return definitions
    .map(
      (definition) => ({
        ...definition,

        value:
          finiteNumberOrNull(
            definition.value
          )
      })
    )
    .filter(
      (definition) =>
        definition.value !== null
    );
}


export function buildHypothesisCard(
  hypothesisId,
  source = {}
) {
  const hypothesis =
    objectOrEmpty(source);

  const scenarioCoverage =
    objectOrEmpty(
      hypothesis.scenarioCoverage
    );

  const scenarios =
    Object.entries(
      scenarioCoverage
    ).map(
      ([
        scenarioId,
        coverage
      ]) => {
        const item =
          objectOrEmpty(coverage);

        return {
          id:
            scenarioId,

          validRuns:
            Number(
              item.validRuns ?? 0
            ),

          requiredRuns:
            Number(
              item.requiredRuns ?? 0
            ),

          sufficient:
            item.sufficient === true,

          performanceReferenceMetRuns:
            finiteNumberOrNull(
              item
                .performanceReferenceMetRuns
            ),

          performanceReferenceSeconds:
            finiteNumberOrNull(
              item
                .performanceReferenceSeconds
            ),

          performanceAssessment:
            translatedHypothesisText(
              item.performanceAssessment
            )
        };
      }
    );

  const criteria =
    arrayOrEmpty(
      hypothesis.criteriaResults
    ).map(
      (criterion) => ({
        id:
          criterion.criterionId ??
          criterion.id ??
          null,

        metric:
          criterion.metric ??
          null,

        aggregation:
          criterion.aggregation ??
          null,

        observed:
          criterion.observed ??
          null,

        unit:
          criterion.unit ??
          null,

        operator:
          criterion.operator ??
          null,

        threshold:
          criterion.threshold ??
          null,

        sampleSize:
          Number(
            criterion.sampleSize ??
            0
          ),

        required:
          criterion.required === true,

        interpretation:
          criterion.interpretation ??
          null,

        scenarios:
          arrayOrEmpty(
            criterion.scenarios
          ),

        status:
          normalizeVerdict(
            criterion.status
          )
      })
    );

  return {
    id:
      hypothesisId,

    title:
      hypothesis.title ??
      hypothesisId,

    statement:
      hypothesis.statement ??
      null,

    scientificVerdict:
      hypothesis.scientificVerdict ??
      null,

    scientificVerdictLabel:
      translatedHypothesisText(
        hypothesis.scientificVerdict
      ),

    validationScope:
      hypothesis.validationScope ??
      null,

    validationScopeLabel:
      translatedHypothesisText(
        hypothesis.validationScope
      ),

    decisionBasis:
      hypothesis.decisionBasis ??
      null,

    decisionBasisLabel:
      translatedHypothesisText(
        hypothesis.decisionBasis
      ),

    thresholdInterpretation:
      hypothesis.thresholdInterpretation ??
      null,

    thresholdInterpretationLabel:
      translatedHypothesisText(
        hypothesis.thresholdInterpretation
      ),

    functionalSuccessRatePercent:
      finiteNumberOrNull(
        hypothesis
          .functionalSuccessRatePercent
      ),

    evaluatedAt:
      hypothesis.evaluatedAt ??
      null,

    sourceSummary:
      hypothesis.sourceSummary ??
      null,

    limitations:
      arrayOrEmpty(
        hypothesis.limitations
      ).map(
        translatedHypothesisText
      ),

    components:
      buildHypothesisComponents(
        hypothesis.components
      ),

    supportingMetrics:
      buildSupportingMetrics(
        hypothesis.supportingMetrics
      ),

    ...getVerdictMetadata(
      hypothesis.verdict
    ),

    totalRunsFound:
      Number(
        hypothesis.totalRunsFound ??
        0
      ),

    totalValidRuns:
      Number(
        hypothesis.totalValidRuns ??
        0
      ),

    minimumValidRunsPerScenario:
      Number(
        hypothesis
          .minimumValidRunsPerScenario ??
        3
      ),

    scenarios,
    criteria
  };
}


function getPodRestartCount(pod) {
  return arrayOrEmpty(
    pod.containers
  ).reduce(
    (
      total,
      container
    ) =>
      total +
      Number(
        container.restartCount ??
        0
      ),
    0
  );
}


function isPodReady(pod) {
  const containers =
    arrayOrEmpty(
      pod.containers
    );

  return (
    pod.phase === "Running" &&
    containers.length > 0 &&
    containers.every(
      (container) =>
        container.ready === true
    )
  );
}


function podBelongsToService(
  pod,
  serviceId
) {
  const containers =
    arrayOrEmpty(
      pod.containers
    );

  const containerMatch =
    containers.some(
      (container) =>
        container.name === serviceId
    );

  const podName =
    String(
      pod.name ?? ""
    );

  return (
    containerMatch ||
    podName.startsWith(
      `${serviceId}-`
    )
  );
}


function buildServiceStatus({
  deployment,
  pods
}) {
  const desiredReplicas =
    Number(
      deployment?.replicas ??
      0
    );

  const readyReplicas =
    Number(
      deployment?.readyReplicas ??
      0
    );

  const availableReplicas =
    Number(
      deployment?.availableReplicas ??
      0
    );

  if (
    !deployment ||
    availableReplicas < 1 ||
    pods.length < 1
  ) {
    return {
      code: "UNAVAILABLE",
      label: "Indisponible",
      tone: "danger"
    };
  }

  const everyPodReady =
    pods.every(
      isPodReady
    );

  if (
    availableReplicas <
      desiredReplicas ||
    readyReplicas <
      desiredReplicas ||
    !everyPodReady
  ) {
    return {
      code: "DEGRADED",
      label: "Dégradé",
      tone: "warning"
    };
  }

  return {
    code: "OPERATIONAL",
    label: "Opérationnel",
    tone: "success"
  };
}


export function buildMicroservicesView({
  deployments = {},
  pods = {},
  resourcesByService = {}
} = {}) {
  const deploymentItems =
    arrayOrEmpty(
      deployments.deployments
    );

  const podItems =
    arrayOrEmpty(
      pods.pods
    );

  const resources =
    objectOrEmpty(
      resourcesByService
    );

  const services =
    SERVICE_DEFINITIONS.map(
      (definition) => {
        const deployment =
          deploymentItems.find(
            (item) =>
              item.name ===
              definition.id
          ) ??
          null;

        const servicePods =
          podItems.filter(
            (pod) =>
              podBelongsToService(
                pod,
                definition.id
              )
          );

        const status =
          buildServiceStatus({
            deployment,
            pods: servicePods
          });

        const resourceSource =
          objectOrEmpty(
            resources[
              definition.id
            ]
          );

        const hasResourceMetrics =
          Object.keys(
            resourceSource
          ).length > 0;

        const normalizedPods =
          servicePods.map(
            (pod) => ({
              name:
                pod.name ??
                "Non disponible",

              phase:
                pod.phase ??
                "UNKNOWN",

              podIP:
                pod.podIP ??
                null,

              nodeName:
                pod.nodeName ??
                null,

              ready:
                isPodReady(
                  pod
                ),

              restarts:
                getPodRestartCount(
                  pod
                ),

              images:
                [
                  ...new Set(
                    arrayOrEmpty(
                      pod.containers
                    )
                      .map(
                        (container) =>
                          container.image
                      )
                      .filter(Boolean)
                  )
                ]
            })
          );

        return {
          ...definition,

          deploymentName:
            deployment?.name ??
            null,

          desiredReplicas:
            Number(
              deployment?.replicas ??
              0
            ),

          readyReplicas:
            Number(
              deployment
                ?.readyReplicas ??
              0
            ),

          availableReplicas:
            Number(
              deployment
                ?.availableReplicas ??
              0
            ),

          updatedReplicas:
            Number(
              deployment
                ?.updatedReplicas ??
              0
            ),

          pods:
            normalizedPods,

          currentRestarts:
            normalizedPods.reduce(
              (
                total,
                pod
              ) =>
                total +
                pod.restarts,
              0
            ),

          statusCode:
            status.code,

          statusLabel:
            status.label,

          statusTone:
            status.tone,

          resourceMetrics:
            hasResourceMetrics
              ? {
                  observations:
                    Number(
                      resourceSource
                        .observations ??
                      0
                    ),

                  meanCpuMillicores:
                    Number(
                      resourceSource
                        .meanCpuMillicores ??
                      0
                    ),

                  meanMemoryMiB:
                    Number(
                      resourceSource
                        .meanMemoryMiB ??
                      0
                    ),

                  totalRestartDelta:
                    Number(
                      resourceSource
                        .totalRestartDelta ??
                      0
                    )
                }
              : null
        };
      }
    );

  const businessServices =
    services.filter(
      (service) =>
        service.category ===
        "business"
    );

  const experimentalComponents =
    services.filter(
      (service) =>
        service.category ===
        "experimental"
    );

  return {
    totalServices:
      services.length,

    operationalServices:
      services.filter(
        (service) =>
          service.statusCode ===
          "OPERATIONAL"
      ).length,

    degradedServices:
      services.filter(
        (service) =>
          service.statusCode ===
          "DEGRADED"
      ).length,

    unavailableServices:
      services.filter(
        (service) =>
          service.statusCode ===
          "UNAVAILABLE"
      ).length,

    groups: [
      {
        id: "business",
        title:
          "Microservices métier",

        description:
          "Les cinq services constituant la chaîne " +
          "applicative Smart Grid.",

        services:
          businessServices
      },
      {
        id: "experimental",
        title:
          "Composants expérimentaux",

        description:
          "Les composants assurant la consultation " +
          "et la présentation des preuves.",

        services:
          experimentalComponents
      }
    ],

    resourceSource:
      "Hypothèse H2 — trois exécutions officielles"
  };
}


export function buildExportsView(
  exportsManifest = {}
) {
  const source =
    objectOrEmpty(
      exportsManifest
    );

  const categories =
    arrayOrEmpty(
      source.categories
    ).map(
      (category) => {
        const categorySource =
          objectOrEmpty(
            category
          );

        const items =
          arrayOrEmpty(
            categorySource.items
          ).map(
            (item) => {
              const itemSource =
                objectOrEmpty(
                  item
                );

              return {
                id:
                  itemSource.id ??
                  "unknown-export",

                categoryId:
                  categorySource.id ??
                  null,

                label:
                  itemSource.label ??
                  itemSource.filename ??
                  "Export",

                description:
                  itemSource.description ??
                  null,

                type:
                  itemSource.type ??
                  "unknown",

                format:
                  itemSource.format ??
                  "Fichier",

                filename:
                  itemSource.filename ??
                  null,

                contentType:
                  itemSource.contentType ??
                  null,

                sourcePath:
                  itemSource.sourcePath ??
                  null,

                downloadPath:
                  itemSource.downloadPath ??
                  null,

                available:
                  itemSource.available ===
                  true,

                sizeBytes:
                  Number.isFinite(
                    Number(
                      itemSource.sizeBytes
                    )
                  )
                    ? Number(
                        itemSource.sizeBytes
                      )
                    : null,

                sha256:
                  itemSource.sha256 ??
                  null
              };
            }
          );

        return {
          id:
            categorySource.id ??
            "unknown-category",

          label:
            categorySource.label ??
            "Exports",

          description:
            categorySource.description ??
            null,

          items,

          availableItems:
            items.filter(
              (item) =>
                item.available
            ).length
        };
      }
    );

  const items =
    categories.flatMap(
      (category) =>
        category.items
    );

  const integrity =
    objectOrEmpty(
      source.integrity
    );

  return {
    available:
      source.readOnly === true &&
      items.length > 0,

    readOnly:
      source.readOnly === true,

    documentStatus:
      source.documentStatus ??
      "NOT_AVAILABLE",

    generatedAt:
      source.generatedAt ??
      null,

    totalItems:
      items.length,

    availableItems:
      items.filter(
        (item) =>
          item.available
      ).length,

    officialFiles:
      items.filter(
        (item) =>
          item.type ===
          "official_file"
      ).length,

    dynamicExports:
      items.filter(
        (item) =>
          item.type ===
          "dynamic_export"
      ).length,

    totalOfficialBytes:
      items
        .filter(
          (item) =>
            item.type ===
            "official_file"
        )
        .reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.sizeBytes ??
              0
            ),
          0
        ),

    integrity: {
      status:
        integrity.status ??
        "UNKNOWN",

      checks:
        arrayOrEmpty(
          integrity.checks
        )
    },

    categories,
    items
  };
}


const SYNTHESIS_CHAIN = [
  {
    id:
      "research-questions",

    label:
      "Questions de recherche"
  },
  {
    id:
      "hypotheses",

    label:
      "Hypothèses"
  },
  {
    id:
      "metrics",

    label:
      "Métriques"
  },
  {
    id:
      "experiments",

    label:
      "Expérimentations"
  },
  {
    id:
      "results",

    label:
      "Résultats"
  },
  {
    id:
      "decisions",

    label:
      "Décisions"
  }
];


function synthesisMetric(
  id,
  label,
  value,
  unit = null,
  note = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return {
    id,
    label,
    value,
    unit,
    note
  };
}


function buildSynthesisHypothesis(
  hypothesisId,
  hypothesis = {}
) {
  const source =
    objectOrEmpty(
      hypothesis
    );

  const verdict =
    getVerdictMetadata(
      source.verdict
    );

  return {
    id:
      hypothesisId,

    title:
      source.title ??
      hypothesisId,

    statement:
      source.statement ??
      null,

    verdict:
      verdict.verdict,

    verdictLabel:
      verdict.label,

    verdictTone:
      verdict.tone,

    officialRuns:
      Number(
        source.officialRuns ??
        0
      ),

    technicallyValidRuns:
      Number(
        source.technicallyValidRuns ??
        0
      ),

    scientificConclusion:
      source.scientificConclusion ??
      null,

    validationScope:
      source.validationScope ??
      null,

    validationScopeLabel:
      translatedHypothesisText(
        source.validationScope
      )
  };
}


function buildSynthesisH1Metrics(
  hypothesis = {}
) {
  const source =
    objectOrEmpty(
      hypothesis
    );

  const components =
    objectOrEmpty(
      source.components
    );

  const deployment =
    objectOrEmpty(
      components.continuousDeployment
    );

  const recovery =
    objectOrEmpty(
      components.failureRecovery
    );

  const scaling =
    objectOrEmpty(
      components.dynamicScaling
    );

  return [
    synthesisMetric(
      "deployment-time",
      "Déploiement moyen",
      deployment.meanSeconds,
      "s",
      `${deployment.referenceMetRuns ?? 0}/` +
      `${deployment.officialRuns ?? 0} sous la référence de ` +
      `${deployment.referenceSeconds ?? 0} s`
    ),

    synthesisMetric(
      "mttr",
      "MTTR moyen",
      recovery.meanMttrSeconds,
      "s",
      `${recovery.referenceMetRuns ?? 0}/` +
      `${recovery.officialRuns ?? 0} sous la référence de ` +
      `${recovery.referenceSeconds ?? 0} s`
    ),

    synthesisMetric(
      "scaling-time",
      "Scalabilité moyenne",
      scaling.meanSeconds,
      "s",
      `${scaling.referenceMetRuns ?? 0}/` +
      `${scaling.officialRuns ?? 0} sous la référence indicative de ` +
      `${scaling.referenceSeconds ?? 0} s`
    ),

    synthesisMetric(
      "scaling-functional-success",
      "Réussite fonctionnelle de la scalabilité",
      scaling.functionalSuccessRatePercent,
      "%",
      "Cible de réplication atteinte dans les trois exécutions"
    )
  ].filter(Boolean);
}


function buildSynthesisH2Metrics(
  hypothesis = {}
) {
  const source =
    objectOrEmpty(
      hypothesis
    );

  const workload =
    objectOrEmpty(
      source.workload
    );

  const primary =
    objectOrEmpty(
      source.primaryMetrics
    );

  const descriptive =
    objectOrEmpty(
      source.descriptiveMetrics
    );

  const prometheus =
    objectOrEmpty(
      primary
        .prometheusServiceCoveragePercent
    );

  const loki =
    objectOrEmpty(
      primary
        .lokiServiceCoveragePercent
    );

  const correlation =
    objectOrEmpty(
      primary
        .requestIdCorrelationCoveragePercent
    );

  const logVisibility =
    objectOrEmpty(
      primary
        .logVisibilityDelayMilliseconds
    );

  const metricVisibility =
    objectOrEmpty(
      primary
        .metricVisibilityDelayMilliseconds
    );

  const failures =
    objectOrEmpty(
      descriptive
        .httpFailureRatePercent
    );

  const latencyAverage =
    objectOrEmpty(
      descriptive
        .httpLatencyAverageMilliseconds
    );

  const latencyP95 =
    objectOrEmpty(
      descriptive
        .httpLatencyP95Milliseconds
    );

  const latencyMaximum =
    objectOrEmpty(
      descriptive
        .httpLatencyMaximumMilliseconds
    );

  return [
    synthesisMetric(
      "http-requests",
      "Requêtes HTTP",
      workload.totalHttpRequests,
      null,
      "Total des trois exécutions officielles"
    ),

    synthesisMetric(
      "http-failure-rate",
      "Taux d’échec HTTP moyen",
      failures.mean,
      "%"
    ),

    synthesisMetric(
      "latency-average",
      "Latence HTTP moyenne",
      latencyAverage.mean,
      "ms"
    ),

    synthesisMetric(
      "latency-p95",
      "Latence HTTP p95 moyenne",
      latencyP95.mean,
      "ms"
    ),

    synthesisMetric(
      "latency-maximum",
      "Latence maximale observée",
      latencyMaximum.maximumObserved,
      "ms"
    ),

    synthesisMetric(
      "prometheus-coverage",
      "Couverture Prometheus minimale",
      prometheus.minimum,
      "%"
    ),

    synthesisMetric(
      "loki-coverage",
      "Couverture Loki minimale",
      loki.minimum,
      "%"
    ),

    synthesisMetric(
      "request-id-correlation",
      "Corrélation request-id minimale",
      correlation.minimum,
      "%"
    ),

    synthesisMetric(
      "maximum-log-visibility",
      "Visibilité maximale des logs",
      logVisibility.maximum,
      "ms",
      `Référence : ${logVisibility.reference ?? 0} ms`
    ),

    synthesisMetric(
      "maximum-metric-visibility",
      "Visibilité maximale des métriques",
      metricVisibility.maximum,
      "ms",
      `Référence : ${metricVisibility.reference ?? 0} ms`
    )
  ].filter(Boolean);
}


function buildSynthesisLimitations(
  hypotheses = {}
) {
  const items = [];

  for (
    const hypothesisId
    of HYPOTHESIS_ORDER
  ) {
    const hypothesis =
      objectOrEmpty(
        hypotheses[hypothesisId]
      );

    for (
      const limitation
      of arrayOrEmpty(
        hypothesis.limitations
      )
    ) {
      const translated =
        translatedHypothesisText(
          limitation
        );

      if (
        translated &&
        !items.includes(translated)
      ) {
        items.push(translated);
      }
    }
  }

  return items;
}


export function buildSynthesisView(
  finalSummary = {}
) {
  const source =
    objectOrEmpty(
      finalSummary
    );

  const hypotheses =
    objectOrEmpty(
      source.hypotheses
    );

  const h1 =
    objectOrEmpty(
      hypotheses.H1
    );

  const h2 =
    objectOrEmpty(
      hypotheses.H2
    );

  const hypothesisCards =
    HYPOTHESIS_ORDER.map(
      (hypothesisId) =>
        buildSynthesisHypothesis(
          hypothesisId,
          hypotheses[hypothesisId]
        )
    );

  return {
    available:
      source.documentStatus ===
      "FINAL_OFFICIAL",

    documentStatus:
      source.documentStatus ??
      "NOT_AVAILABLE",

    schemaVersion:
      source.schemaVersion ??
      null,

    generatedAt:
      source.generatedAt ??
      null,

    totalOfficialRuns:
      Number(
        source.totalOfficialRuns ??
        0
      ),

    totalTechnicallyValidRuns:
      Number(
        source.totalTechnicallyValidRuns ??
        0
      ),

    globalTechnicalValidityRatePercent:
      Number(
        source
          .globalTechnicalValidityRatePercent ??
        0
      ),

    globalConclusion:
      source.globalConclusion ??
      null,

    chain:
      SYNTHESIS_CHAIN,

    hypotheses:
      hypothesisCards,

    h1Metrics:
      buildSynthesisH1Metrics(
        h1
      ),

    h2Metrics:
      buildSynthesisH2Metrics(
        h2
      ),

    limitations:
      buildSynthesisLimitations(
        hypotheses
      ),

    sourceArtifacts:
      arrayOrEmpty(
        source.sourceArtifacts
      )
  };
}


const EXPERIMENT_SCENARIOS = {
  continuous_deployment: {
    label:
      "Déploiement continu",

    description:
      "Construction des images, déploiement Kubernetes, " +
      "validation des rollouts et contrôles de santé."
  },

  controlled_failure: {
    label:
      "Panne contrôlée",

    description:
      "Suppression contrôlée d’un Pod et mesure du temps " +
      "de restauration du service."
  },

  dynamic_scaling: {
    label:
      "Scalabilité dynamique",

    description:
      "Augmentation contrôlée des réplicas et mesure du " +
      "temps nécessaire pour atteindre la cible."
  },

  integrated_observability_under_load: {
    label:
      "Observabilité intégrée sous charge",

    description:
      "Charge constante, collecte Prometheus, journaux Loki " +
      "et corrélation par identifiant de requête."
  }
};


const EXPERIMENT_SCENARIO_ORDER = [
  "continuous_deployment",
  "controlled_failure",
  "dynamic_scaling",
  "integrated_observability_under_load"
];


function firstBoolean(...values) {
  for (const value of values) {
    if (
      typeof value ===
      "boolean"
    ) {
      return value;
    }
  }

  return null;
}


function experimentMetric(
  id,
  label,
  value,
  unit = null
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return {
    id,
    label,
    value,
    unit
  };
}


function buildExperimentMetrics(
  scenario,
  metrics = {}
) {
  const source =
    objectOrEmpty(
      metrics
    );

  const definitions = {
    continuous_deployment: [
      experimentMetric(
        "deploymentTimeSeconds",
        "Temps de déploiement",
        source.deploymentTimeSeconds,
        "s"
      ),
      experimentMetric(
        "referenceSeconds",
        "Référence indicative",
        source.referenceSeconds,
        "s"
      ),
      experimentMetric(
        "treeInvariant",
        "Arbre Git invariant",
        source.treeInvariant
      )
    ],

    controlled_failure: [
      experimentMetric(
        "mttrSeconds",
        "MTTR",
        source.mttrSeconds,
        "s"
      ),
      experimentMetric(
        "referenceSeconds",
        "Référence indicative",
        source.referenceSeconds,
        "s"
      ),
      experimentMetric(
        "serviceRecovered",
        "Service restauré",
        source.serviceRecovered
      )
    ],

    dynamic_scaling: [
      experimentMetric(
        "scalingTimeSeconds",
        "Temps de scalabilité",
        source.scalingTimeSeconds,
        "s"
      ),
      experimentMetric(
        "referenceSeconds",
        "Référence indicative",
        source.referenceSeconds,
        "s"
      ),
      experimentMetric(
        "targetReached",
        "Cible atteinte",
        source.targetReached
      )
    ],

    integrated_observability_under_load: [
      experimentMetric(
        "httpRequestsTotal",
        "Requêtes HTTP",
        source.httpRequestsTotal
      ),
      experimentMetric(
        "httpFailureRatePct",
        "Taux d’échec HTTP",
        source.httpFailureRatePct,
        "%"
      ),
      experimentMetric(
        "httpLatencyAverageMs",
        "Latence moyenne",
        source.httpLatencyAverageMs,
        "ms"
      ),
      experimentMetric(
        "httpLatencyP95Ms",
        "Latence p95",
        source.httpLatencyP95Ms,
        "ms"
      ),
      experimentMetric(
        "httpLatencyMaxMs",
        "Latence maximale",
        source.httpLatencyMaxMs,
        "ms"
      ),
      experimentMetric(
        "prometheusServiceCoveragePct",
        "Couverture Prometheus",
        source.prometheusServiceCoveragePct,
        "%"
      ),
      experimentMetric(
        "lokiServiceCoveragePct",
        "Couverture Loki",
        source.lokiServiceCoveragePct,
        "%"
      ),
      experimentMetric(
        "requestIdCorrelationCoveragePct",
        "Corrélation request-id",
        source.requestIdCorrelationCoveragePct,
        "%"
      ),
      experimentMetric(
        "logVisibilityDelayMs",
        "Visibilité des logs",
        source.logVisibilityDelayMs,
        "ms"
      ),
      experimentMetric(
        "metricVisibilityDelayMs",
        "Visibilité des métriques",
        source.metricVisibilityDelayMs,
        "ms"
      ),
      experimentMetric(
        "artifactCompletenessPct",
        "Complétude des artefacts",
        source.artifactCompletenessPct,
        "%"
      )
    ]
  };

  return arrayOrEmpty(
    definitions[scenario]
  ).filter(Boolean);
}


function buildPrimaryExperimentMetric(
  scenario,
  metrics = {}
) {
  const source =
    objectOrEmpty(
      metrics
    );

  const definitions = {
    continuous_deployment: {
      label:
        "Temps de déploiement",

      value:
        source.deploymentTimeSeconds,

      unit:
        "s"
    },

    controlled_failure: {
      label:
        "MTTR",

      value:
        source.mttrSeconds,

      unit:
        "s"
    },

    dynamic_scaling: {
      label:
        "Temps de scalabilité",

      value:
        source.scalingTimeSeconds,

      unit:
        "s"
    },

    integrated_observability_under_load: {
      label:
        "Latence HTTP p95",

      value:
        source.httpLatencyP95Ms,

      unit:
        "ms"
    }
  };

  const result =
    definitions[scenario];

  if (
    !result ||
    result.value === null ||
    result.value === undefined
  ) {
    return null;
  }

  return result;
}


function normalizeExperimentRun(
  run = {}
) {
  const source =
    objectOrEmpty(run);

  const evaluation =
    objectOrEmpty(
      source.evaluation
    );

  const metrics =
    objectOrEmpty(
      evaluation.metrics
    );

  const hypothesisId =
    source.hypothesisId ??
    evaluation.hypothesisId ??
    "UNKNOWN";

  const scenario =
    source.scenario ??
    evaluation.scenario ??
    "unknown";

  const verdictMetadata =
    getVerdictMetadata(
      source.verdict ??
      evaluation.verdict
    );

  const technicallyValid =
    firstBoolean(
      evaluation.technicallyValid,
      evaluation.valid
    );

  const functionalSuccess =
    hypothesisId === "H1"
      ? firstBoolean(
          source.functionalSuccess,
          evaluation.functionalSuccess
        )
      : null;

  const performanceReferenceMet =
    firstBoolean(
      source.performanceReferenceMet,
      evaluation.performanceReferenceMet,
      metrics.referenceMet
    );

  return {
    runId:
      source.runId ??
      evaluation.runId ??
      "Non disponible",

    hypothesisId,

    scenario,

    scenarioLabel:
      EXPERIMENT_SCENARIOS[
        scenario
      ]?.label ??
      scenario.replaceAll("_", " "),

    verdict:
      verdictMetadata.verdict,

    verdictLabel:
      verdictMetadata.label,

    verdictTone:
      verdictMetadata.tone,

    technicallyValid,

    functionalSuccess,

    performanceReferenceMet,

    referenceSeconds:
      metrics.referenceSeconds ??
      null,

    primaryMetric:
      buildPrimaryExperimentMetric(
        scenario,
        metrics
      ),

    metrics:
      buildExperimentMetrics(
        scenario,
        metrics
      ),

    sourceDecision:
      evaluation.sourceDecision ??
      null,

    experimentId:
      evaluation.experimentId ??
      null,

    requestId:
      evaluation.requestId ??
      null,

    evaluationFile:
      source.evaluationFile ??
      null,

    sourceArtifact:
      evaluation.sourceArtifact ??
      null
  };
}


export function buildExperimentsView(
  evaluations = {}
) {
  const source =
    objectOrEmpty(
      evaluations
    );

  const runs =
    arrayOrEmpty(
      source.runs
    )
      .map(
        normalizeExperimentRun
      )
      .sort(
        (first, second) =>
          first.runId.localeCompare(
            second.runId
          )
      );

  const groups =
    HYPOTHESIS_ORDER.map(
      (hypothesisId) => {
        const hypothesisRuns =
          runs.filter(
            (run) =>
              run.hypothesisId ===
              hypothesisId
          );

        const scenarios =
          EXPERIMENT_SCENARIO_ORDER
            .filter(
              (scenarioId) =>
                hypothesisRuns.some(
                  (run) =>
                    run.scenario ===
                    scenarioId
                )
            )
            .map(
              (scenarioId) => ({
                id:
                  scenarioId,

                label:
                  EXPERIMENT_SCENARIOS[
                    scenarioId
                  ]?.label ??
                  scenarioId,

                description:
                  EXPERIMENT_SCENARIOS[
                    scenarioId
                  ]?.description ??
                  null,

                runs:
                  hypothesisRuns.filter(
                    (run) =>
                      run.scenario ===
                      scenarioId
                  )
              })
            );

        return {
          id:
            hypothesisId,

          title:
            `Hypothèse ${hypothesisId}`,

          runCount:
            hypothesisRuns.length,

          scenarios
        };
      }
    ).filter(
      (group) =>
        group.runCount > 0
    );

  const referenceApplicableRuns =
    runs.filter(
      (run) =>
        run.performanceReferenceMet !==
        null
    );

  return {
    source:
      "/api/evaluations",

    totalRuns:
      runs.length,

    technicallyValidRuns:
      runs.filter(
        (run) =>
          run.technicallyValid === true
      ).length,

    validatedRuns:
      runs.filter(
        (run) =>
          run.verdict === "VALIDATED"
      ).length,

    h1Runs:
      runs.filter(
        (run) =>
          run.hypothesisId === "H1"
      ).length,

    h2Runs:
      runs.filter(
        (run) =>
          run.hypothesisId === "H2"
      ).length,

    scenarioCount:
      groups.reduce(
        (
          total,
          group
        ) =>
          total +
          group.scenarios.length,
        0
      ),

    referenceApplicableRuns:
      referenceApplicableRuns.length,

    referenceMetRuns:
      referenceApplicableRuns.filter(
        (run) =>
          run.performanceReferenceMet ===
          true
      ).length,

    groups,
    runs
  };
}


export function summarizeKubernetes({
  deployments = {},
  pods = {}
} = {}) {
  const deploymentItems =
    arrayOrEmpty(
      deployments.deployments
    );

  const podItems =
    arrayOrEmpty(
      pods.pods
    );

  return {
    deployments:
      deploymentItems,

    pods:
      podItems,

    totalDeployments:
      deploymentItems.length,

    activeDeployments:
      deploymentItems.filter(
        (deployment) =>
          Number(
            deployment.readyReplicas ??
            0
          ) > 0
      ).length,

    totalPods:
      podItems.length,

    runningPods:
      podItems.filter(
        (pod) =>
          pod.phase === "Running"
      ).length,

    totalRestarts:
      podItems.reduce(
        (
          total,
          pod
        ) =>
          total +
          arrayOrEmpty(
            pod.containers
          ).reduce(
            (
              containerTotal,
              container
            ) =>
              containerTotal +
              Number(
                container.restartCount ??
                0
              ),
            0
          ),
        0
      )
  };
}


export function buildDashboardViewModel({
  health = {},
  evaluations = {},
  finalSummary = {},
  exportsManifest = {},
  deployments = {},
  pods = {}
} = {}) {
  const hypotheses =
    objectOrEmpty(
      evaluations.hypotheses
    );

  const kubernetesSummary =
    summarizeKubernetes({
      deployments,
      pods
    });

  const h2Evaluation =
    objectOrEmpty(
      hypotheses.H2
    );

  const microservices =
    buildMicroservicesView({
      deployments,
      pods,
      resourcesByService:
        h2Evaluation
          .resourcesByService
    });

  const experiments =
    buildExperimentsView(
      evaluations
    );

  const synthesis =
    buildSynthesisView(
      finalSummary
    );

  const exportsView =
    buildExportsView(
      exportsManifest
    );

  return {
    serviceStatus:
      health.status ??
      "UNKNOWN",

    storageMode:
      health.storageMode ??
      evaluations.reportsHealth
        ?.storageMode ??
      "unknown",

    reportsDirectory:
      health.reports
        ?.reportsDirectory ??
      evaluations.reportsHealth
        ?.reportsDirectory ??
      null,

    actionsEnabled:
      health.actionsEnabled === true,

    totalRunsEvaluated:
      Number(
        evaluations
          .totalRunsEvaluated ??
        0
      ),

    generatedAt:
      evaluations.generatedAt ??
      health.timestamp ??
      null,

    hypotheses:
      HYPOTHESIS_ORDER.map(
        (hypothesisId) =>
          buildHypothesisCard(
            hypothesisId,
            hypotheses[hypothesisId]
          )
      ),

    kubernetes:
      kubernetesSummary,

    microservices,

    experiments,

    synthesis,

    exports:
      exportsView
  };
}


export async function fetchJson(
  fetchImplementation,
  url
) {
  const response =
    await fetchImplementation(url);

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} pour ${url}`
    );
  }

  return response.json();
}


export async function loadDashboardData({
  fetchImplementation =
    globalThis.fetch,

  apiBaseUrl = ""
} = {}) {
  if (
    typeof fetchImplementation !==
    "function"
  ) {
    throw new TypeError(
      "Une implémentation fetch est requise"
    );
  }

  const endpoints = {
    health:
      "/dashboard/health",

    evaluations:
      "/api/evaluations",

    finalSummary:
      "/api/final-summary",

    exportsManifest:
      "/api/exports",

    deployments:
      "/api/kubernetes/deployments",

    pods:
      "/api/kubernetes/pods"
  };

  const entries =
    Object.entries(endpoints);

  const results =
    await Promise.allSettled(
      entries.map(
        ([
          ,
          endpoint
        ]) =>
          fetchJson(
            fetchImplementation,
            `${apiBaseUrl}${endpoint}`
          )
      )
    );

  const data = {};
  const errors = [];

  results.forEach(
    (
      result,
      index
    ) => {
      const [
        key,
        endpoint
      ] = entries[index];

      if (
        result.status ===
        "fulfilled"
      ) {
        data[key] =
          result.value;
      } else {
        data[key] = {};

        errors.push({
          key,
          endpoint,
          message:
            result.reason
              ?.message ??
            String(
              result.reason
            )
        });
      }
    }
  );

  return {
    data,
    errors,

    viewModel:
      buildDashboardViewModel(
        data
      )
  };
}
