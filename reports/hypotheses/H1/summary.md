# Synthèse de validation de l’hypothèse H1

## Décision

L’hypothèse H1 est validée dans le périmètre de l’environnement expérimental local.

## Résultats consolidés

| Composante | Exécutions valides | Moyenne | Référence atteinte | Décision |
|---|---:|---:|---:|---|
| Scalabilité dynamique | 3/3 | 36,880 s | 1/3 | Validation fonctionnelle avec variabilité |
| Récupération après panne | 3/3 | MTTR : 12,987 s | 3/3 | Validée |
| Déploiement CI/CD | 3/3 | 44,099 s | 3/3 | Validée |

Au total, les neuf exécutions officielles sont techniquement valides et présentent un taux de succès fonctionnel de 100 %.

Les résultats montrent que la plateforme automatise le déploiement des cinq microservices, restaure leur disponibilité après une panne contrôlée et adapte dynamiquement les réplicas sous charge.

Les références temporelles ont été utilisées comme indicateurs descriptifs et non comme critères uniques de validation. La scalabilité a fonctionné dans les trois exécutions, malgré le dépassement de la référence de 30 secondes dans deux cas.

## Limites

La portée de cette conclusion est limitée à un cluster K3s mono-nœud exécuté dans une machine virtuelle Ubuntu Server sous VirtualBox. Le faible nombre de répétitions et la variabilité des temps de scalabilité et de déploiement doivent être considérés dans l’interprétation des résultats.
