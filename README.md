# Dix-mille

Feuille de score pour le jeu de dés **dix-mille**, pensée pour le téléphone.

- Liste des joueurs en haut : prénom, couleur, score total et dernier ajout.
- Pavé numérique toujours affiché en bas : on tape la valeur, **Valider** l'ajoute
  au score et passe automatiquement au joueur suivant (valider à vide = 0, tour raté).
- Toucher un joueur le sélectionne (la rotation reprend à partir de lui).
- Toucher le **score** d'un joueur (ou le bouton *Corriger*) permet de fixer son score à la main.
- `±` pour une valeur négative, `↶` pour annuler la dernière action.
- Bouton **Joueurs** : renommer, changer la couleur, ajouter/supprimer, nouvelle partie.
- Poignée `⋮⋮` : glisser pour réorganiser l'ordre des joueurs (aussi en cours de partie).
- Les scores peuvent dépasser 10 000 (règle du dernier tour) ; ils passent en doré.
- Effets sonores discrets (touches, validation, raté, correction, annulation, passage des 10 000) ; bouton ♪ pour couper le son.
- Bouton ⛶ : plein écran (sur iPhone, ajouter l'app à l'écran d'accueil via Partager).
- L'écran reste allumé (Screen Wake Lock API, bouton ☀ pour activer/désactiver).
- Partie sauvegardée automatiquement dans le navigateur ; fonctionne hors ligne
  et peut être ajoutée à l'écran d'accueil.

## Déploiement GitHub Pages

Site 100 % statique, sans build. Dans *Settings → Pages*, choisir
« Deploy from a branch » et la branche voulue, dossier `/ (root)`.
