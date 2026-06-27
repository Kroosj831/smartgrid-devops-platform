# Synthèse scientifique de l'hypothèse H2

## Hypothèse

La chaîne d'observabilité fondée sur Prometheus, Grafana, Alloy et Loki permet de centraliser des métriques et des journaux exploitables pour une requête traversant les cinq microservices Smart Grid.

## Verdict

**H2 est soutenue dans le périmètre expérimental défini.**

Les trois exécutions canoniques sont officielles, techniquement valides
et satisfont les critères d'acceptation A02 à A10.

## Conditions expérimentales

- Cluster : Kubernetes K3s mono-nœud
- Environnement : machine virtuelle Ubuntu Server
- Charge : 20 utilisateurs virtuels
- Durée par exécution : 120 secondes
- Répétitions officielles : 3
- Microservices observés : 5
- Répliques : une par service
- HPA : désactivé

## Résultats consolidés

| Indicateur | Résultat |
|---|---:|
| Exécutions officielles | 3 |
| Exécutions valides | 3 |
| Requêtes totales | 6940 |
| Requêtes moyennes par run | 2313.333 |
| Taux d'échec HTTP moyen | 0.000000 % |
| Latence moyenne inter-runs | 40.245 ms |
| Latence p95 moyenne | 97.807 ms |
| Latence maximale observée | 557.551 ms |
| Couverture Prometheus minimale | 100 % |
| Couverture Loki minimale | 100 % |
| Corrélation request-id minimale | 100 % |
| Délai maximal des logs | 2000 ms |
| Délai maximal des métriques | 2000 ms |
| Référence temporelle | 30000 ms |
| Complétude minimale des artefacts | 100 % |

## Résultats par exécution

| Run | Requêtes | Échec | Moyenne | p95 | Maximum | Prometheus | Loki | Corrélation | Logs | Métriques |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| H2-V2-RUN-01 | 2312 | 0.000000 % | 42.114 ms | 100.777 ms | 557.551 ms | 100 % | 100 % | 100 % | 1000 ms | 1000 ms |
| H2-V2-RUN-02 | 2320 | 0.000000 % | 37.550 ms | 86.974 ms | 434.968 ms | 100 % | 100 % | 100 % | 2000 ms | 2000 ms |
| H2-V2-RUN-03 | 2308 | 0.000000 % | 41.071 ms | 105.670 ms | 468.047 ms | 100 % | 100 % | 100 % | 2000 ms | 2000 ms |

## Consommation moyenne par service

| Service | CPU moyen | Mémoire moyenne | Redémarrages |
|---|---:|---:|---:|
| api-gateway | 118.509 mCPU | 48.335 MiB | 0 |
| data-collector | 29.880 mCPU | 45.169 MiB | 0 |
| iot-simulator | 25.972 mCPU | 43.011 MiB | 0 |
| optimization-service | 25.526 mCPU | 42.968 MiB | 0 |
| processing-service | 24.911 mCPU | 43.546 MiB | 0 |

## Interprétation

La couverture métrique et la couverture des journaux atteignent 100 %
pour les cinq microservices dans chacune des trois exécutions. La requête
sonde officielle est également corrélée de bout en bout dans les cinq
services.

Les délais maximaux de visibilité des logs et des métriques sont de
2 000 ms, soit largement en dessous de la référence de 30 000 ms fixée
dans le protocole.

Les trois exécutions totalisent 6 940 requêtes sans échec HTTP. La
latence moyenne inter-runs est d'environ 40,245 ms et la latence p95
moyenne d'environ 97,807 ms. Ces valeurs décrivent le comportement de
la plateforme sous charge, mais ne constituent pas à elles seules la
base de validation de H2.

Aucun redémarrage de conteneur n'a été observé pendant les trois
expérimentations.

## Décision

Conformément à la règle définie dans le protocole H2 V2, l'hypothèse est
soutenue, puisque les trois exécutions canoniques sont valides et
satisfont les critères A02 à A10.

Cette conclusion demeure limitée à l'environnement expérimental local,
virtualisé et mono-nœud utilisé dans cette recherche.

## Limites

- cluster K3s mono-nœud ;
- infrastructure locale virtualisée ;
- trois répétitions officielles ;
- charge constante de 20 utilisateurs virtuels pendant 120 secondes ;
- une seule réplique par microservice ;
- HPA désactivé ;
- absence de validation sur un cluster distribué multi-nœuds.
