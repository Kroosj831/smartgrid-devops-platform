# Évaluation de l'hypothèse H2

**Titre :** Supervision et observabilité

**Verdict :** INDETERMINATE

**Date d'évaluation :** 2026-06-21T13:40:00.909Z

**Exécutions trouvées :** 0

**Exécutions valides :** 0

**Minimum requis par scénario :** 3

## Couverture des scénarios

| Scénario | Exécutions valides | Minimum requis | Suffisant |
|---|---:|---:|---|
| nominal | 0 | 3 | Non |
| high_load | 0 | 3 | Non |
| observable_anomaly | 0 | 3 | Non |

## Évaluation des critères

| Critère | Métrique | Agrégation | Valeur observée | Seuil | Échantillon | Statut |
|---|---|---|---:|---|---:|---|
| H2-C1 | monitoring_coverage_percent | latest | Non mesurée | == 100 % | 0 | NOT_MEASURED |
| H2-C2 | metrics_available | all | Non mesurée | == true boolean | 0 | NOT_MEASURED |
| H2-C3 | logs_available | all | Non mesurée | == true boolean | 0 | NOT_MEASURED |
| H2-C4 | detection_time_seconds | median | Non mesurée | <= 30 s | 0 | NOT_MEASURED |
| H2-C5 | affected_service_identified | all | Non mesurée | == true boolean | 0 | NOT_MEASURED |
| H2-C6 | evidence_formats_complete | all | Non mesurée | == true boolean | 0 | NOT_MEASURED |
| H2-C7 | anomaly_detection_rate_percent | mean | Non mesurée | >= 100 % | 0 | NOT_MEASURED |

Le verdict demeure indéterminé car toutes les mesures ou répétitions minimales ne sont pas encore disponibles.

