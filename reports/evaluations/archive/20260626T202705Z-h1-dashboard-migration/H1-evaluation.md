# Évaluation de l'hypothèse H1

**Titre :** Automatisation du déploiement et de l'exploitation

**Verdict :** INDETERMINATE

**Date d'évaluation :** 2026-06-21T13:40:00.905Z

**Exécutions trouvées :** 0

**Exécutions valides :** 0

**Minimum requis par scénario :** 3

## Couverture des scénarios

| Scénario | Exécutions valides | Minimum requis | Suffisant |
|---|---:|---:|---|
| continuous_deployment | 0 | 3 | Non |
| controlled_failure | 0 | 3 | Non |
| scaling | 0 | 3 | Non |

## Évaluation des critères

| Critère | Métrique | Agrégation | Valeur observée | Seuil | Échantillon | Statut |
|---|---|---|---:|---|---:|---|
| H1-C1 | deployment_time_seconds | median | Non mesurée | <= 180 s | 0 | NOT_MEASURED |
| H1-C2 | deployment_failure_rate_percent | rate | Non mesurée | <= 5 % | 0 | NOT_MEASURED |
| H1-C3 | mttr_seconds | median | Non mesurée | <= 30 s | 0 | NOT_MEASURED |
| H1-C4 | scaling_time_seconds | median | Non mesurée | <= 30 s | 0 | NOT_MEASURED |
| H1-C5 | service_restored | all | Non mesurée | == true boolean | 0 | NOT_MEASURED |

Le verdict demeure indéterminé car toutes les mesures ou répétitions minimales ne sont pas encore disponibles.

