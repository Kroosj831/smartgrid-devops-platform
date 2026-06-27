# Synthèse expérimentale finale officielle

## Statut du document

**FINAL_OFFICIAL**

Date de génération : 2026-06-26T20:37:36.332868+00:00

## Vue globale

| Hypothèse | Exécutions officielles | Exécutions valides | Verdict |
|---|---:|---:|---|
| H1 — Automatisation, résilience et scalabilité | 9 | 9 | VALIDATED |
| H2 — Supervision et observabilité | 3 | 3 | VALIDATED |
| **Total** | **12** | **12** | **100 % techniquement valides** |

## Résultats de H1

### Déploiement continu

| Indicateur | Valeur |
|---|---:|
| Répétitions | 3 |
| Durée moyenne | 44.099 s |
| Médiane | 47.855 s |
| Minimum | 35.636 s |
| Maximum | 48.805 s |
| Écart-type | 7.344 s |
| Référence | 180 s |
| Référence satisfaite | 3/3 |
| Invariance de l'arbre Git | Oui |

### Récupération après panne

| Indicateur | Valeur |
|---|---:|
| Répétitions | 3 |
| MTTR moyen | 12.987 s |
| MTTR médian | 12.989 s |
| Minimum | 12.978 s |
| Maximum | 12.993 s |
| Écart-type | 0.008 s |
| Référence | 60 s |
| Référence satisfaite | 3/3 |

### Scalabilité dynamique

| Indicateur | Valeur |
|---|---:|
| Répétitions | 3 |
| Succès fonctionnel | 100.0 % |
| Temps moyen | 36.880 s |
| Médiane | 41.138 s |
| Minimum | 27.957 s |
| Maximum | 41.546 s |
| Écart-type | 7.731 s |
| Référence indicative | 30 s |
| Référence satisfaite | 1/3 |

La scalabilité a fonctionné dans les trois répétitions. Cependant, deux
exécutions ont dépassé la référence indicative de 30 secondes. H1 est
donc validée fonctionnellement avec une variabilité temporelle mesurée.

## Résultats de H2

| Indicateur | Résultat |
|---|---:|
| Répétitions officielles | 3 |
| Requêtes totales | 6940 |
| Taux d'échec HTTP moyen | 0.000000 % |
| Latence moyenne inter-runs | 40.245 ms |
| Latence p95 moyenne | 97.807 ms |
| Latence maximale observée | 557.551 ms |
| Couverture Prometheus minimale | 100 % |
| Couverture Loki minimale | 100 % |
| Corrélation request-id minimale | 100 % |
| Délai maximal des logs | 2000 ms |
| Délai maximal des métriques | 2000 ms |
| Complétude minimale des preuves | 100 % |

Les trois exécutions H2 satisfont tous les critères primaires définis
dans le protocole officiel.

## Décision scientifique

Les résultats soutiennent H1 et H2 dans l'environnement expérimental
étudié.

H1 démontre que l'intégration du pipeline CI/CD à Kubernetes permet
d'automatiser le déploiement, de récupérer après une panne contrôlée et
d'adapter les réplicas. La performance de scalabilité reste néanmoins
variable.

H2 démontre que Prometheus, Grafana, Alloy et Loki permettent de
centraliser et de corréler les métriques et les journaux des cinq
microservices, avec des délais de visibilité inférieurs à la référence
de 30 secondes.

## Limites générales

- infrastructure locale virtualisée ;
- cluster Kubernetes K3s mono-nœud ;
- trois répétitions par scénario ;
- charge limitée à 20 utilisateurs virtuels pendant 120 secondes pour H2 ;
- absence d'expérimentation sur un cluster distribué multi-nœud ;
- variabilité observée du temps de scalabilité.
