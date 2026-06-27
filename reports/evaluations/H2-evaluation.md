# Évaluation de l'hypothèse H2

**Titre :** Supervision et observabilité

**Verdict :** VALIDATED

**Date d'évaluation :** 2026-06-26T20:14:30.751759+00:00

**Exécutions trouvées :** 3

**Exécutions valides :** 3

**Minimum requis :** 3

## Hypothèse

La chaîne d'observabilité fondée sur Prometheus, Grafana, Alloy et Loki permet de centraliser des métriques et des journaux exploitables pour une requête traversant les cinq microservices Smart Grid.

## Couverture du scénario

| Scénario | Exécutions valides | Minimum requis | Suffisant |
|---|---:|---:|---|
| Observabilité intégrée sous charge | 3 | 3 | Oui |

## Évaluation des critères

| Critère | Métrique | Valeur observée | Seuil | Statut |
|---|---|---:|---:|---|
| A02 | Préconditions valides | Oui | Oui | VALIDATED |
| A03 | Couverture Prometheus | 100 % | 100 % | VALIDATED |
| A04 | Couverture Loki | 100 % | 100 % | VALIDATED |
| A05 | Corrélation request-id | 100 % | 100 % | VALIDATED |
| A06 | Visibilité des logs | 2 000 ms | ≤ 30 000 ms | VALIDATED |
| A07 | Visibilité des métriques | 2 000 ms | ≤ 30 000 ms | VALIDATED |
| A08 | Couverture des sources | 100 % | 100 % | VALIDATED |
| A09 | Complétude des preuves | 100 % | 100 % | VALIDATED |
| A10 | Sonde officielle valide | Oui | Oui | VALIDATED |
| A11 | Runs canoniques valides | 3 | 3 | VALIDATED |

## Résultats descriptifs

- Requêtes totales : 6940
- Taux d'échec HTTP moyen : 0.000000 %
- Latence moyenne inter-runs : 40.245 ms
- Latence p95 moyenne : 97.807 ms
- Latence maximale observée : 557.551 ms
- Redémarrages observés : 0

## Décision

Les trois exécutions officielles satisfont les critères A02 à A10.
Conformément à la règle A11, H2 est soutenue dans le périmètre
expérimental défini.

Cette conclusion reste limitée à une infrastructure locale virtualisée
et à un cluster Kubernetes K3s mono-nœud.
