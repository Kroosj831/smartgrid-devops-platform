# Évaluation de l'hypothèse H1

**Titre :** Automatisation du déploiement, résilience et scalabilité

**Verdict :** VALIDATED

**Date d'évaluation :** 2026-06-26T20:27:05.952476+00:00

**Exécutions trouvées :** 9

**Exécutions techniquement valides :** 9

**Taux de succès fonctionnel :** 100.0 %

## Hypothèse

L'intégration d'un pipeline CI/CD à Kubernetes permet d'automatiser et de reproduire le déploiement des microservices, de restaurer les services après une panne contrôlée, d'adapter dynamiquement les réplicas et de maintenir ou rétablir leur disponibilité.

## Couverture des scénarios

| Scénario | Exécutions valides | Minimum | Conclusion |
|---|---:|---:|---|
| Déploiement continu | 3 | 3 | Validé |
| Récupération après panne | 3 | 3 | Validée |
| Scalabilité dynamique | 3 | 3 | Validée fonctionnellement |

## Résultats consolidés

| Composante | Mesure principale | Résultat | Référence | Interprétation |
|---|---|---:|---:|---|
| Déploiement continu | Durée moyenne | 44.099 s | 180 s | 3/3 sous la référence |
| Récupération après panne | MTTR moyen | 12.987 s | 60 s | 3/3 sous la référence |
| Scalabilité dynamique | Temps moyen | 36.880 s | 30 s | 1/3 sous la référence |

## Déploiement continu

- Moyenne : 44.099 s
- Médiane : 47.855 s
- Minimum : 35.636 s
- Maximum : 48.805 s
- Écart-type : 7.344 s
- Référence satisfaite : 3/3
- Invariance de l'arbre Git : Oui

## Récupération après panne

- MTTR moyen : 12.987 s
- MTTR médian : 12.989 s
- Minimum : 12.978 s
- Maximum : 12.993 s
- Écart-type : 0.008 s
- Référence satisfaite : 3/3

## Scalabilité dynamique

- Temps moyen : 36.880 s
- Médiane : 41.138 s
- Minimum : 27.957 s
- Maximum : 41.546 s
- Écart-type : 7.731 s
- Référence indicative satisfaite : 1/3
- Succès fonctionnel : 100.0 %

La cible de réplication a été atteinte dans les trois exécutions.
Cependant, deux exécutions ont dépassé la référence indicative de
30 secondes. Cette variabilité défavorable est conservée dans
l'évaluation et n'est pas masquée.

## Décision

H1 est soutenue dans le périmètre expérimental défini. Les neuf
exécutions officielles sont techniquement valides et présentent un
succès fonctionnel de 100 %.

La validation fonctionnelle ne signifie pas que toutes les références
temporelles ont été satisfaites. La scalabilité présente une variabilité
mesurée : une seule exécution sur trois a respecté la référence
indicative de 30 secondes.

## Limites

- cluster K3s mono-nœud ;
- infrastructure locale virtualisée ;
- trois répétitions par scénario ;
- variabilité observée des temps de scalabilité ;
- absence de validation sur un cluster distribué multi-nœuds.
