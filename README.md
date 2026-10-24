# Feuilles de score

Feuilles de score pour jouer en famille, pensées pour le téléphone.
La page d'accueil propose trois jeux :

## Dix-mille (`dix-mille.html`)

- Liste des joueurs en haut : prénom, couleur, score total et dernier ajout.
- Pavé numérique toujours affiché en bas : on tape la valeur, **Valider** l'ajoute
  au score et passe automatiquement au joueur suivant (valider à vide = 0, tour raté).
- Toucher un joueur le sélectionne (la rotation reprend à partir de lui).
- Toucher le **score** d'un joueur (ou le bouton *Corriger*) permet de fixer son score à la main.
- `±` pour une valeur négative, `↶` pour annuler la dernière action, puis « ↷ Rétablir » pour la refaire.
- Poignée `⋮⋮` : glisser pour réorganiser l'ordre des joueurs (aussi en cours de partie).
- Les scores peuvent dépasser 10 000 (règle du dernier tour) ; ils passent en doré.

## Yams (`yams.html`)

- Grille classique : As à 6, bonus de 35 points à partir de 63 en haut,
  brelan, carré, full (25), petite suite (30), grande suite (40), yams (50), chance.
- Toucher une case, puis une valeur rapide (multiples de la face, valeur fixe du full…),
  ou taper la valeur au pavé et **Valider**. `✗` barre la case (0 point).
- Le tour passe au joueur suivant dès qu'une case vide est remplie ; la colonne du
  joueur dont c'est le tour est surlignée. Totaux et bonus calculés automatiquement.

## Scoppa (`scoppa.html`)

- Saisie manche par manche : pour chaque équipe, un bouton par point
  (cartes, deniers, 7 de deniers, primiera) — un seul gagnant possible par point,
  aucun en cas d'égalité — et un compteur −/+ pour les scopes.
- « Valider la manche » ajoute les points au total ; les manches jouées restent
  listées et peuvent être modifiées (✎) ou supprimées (✕).
- Score à atteindre au choix (11, 16, 21 ou 31) dans le menu *Équipes* ; l'équipe
  seule en tête au-delà de l'objectif gagne.

## Commun

- Bouton **Joueurs / Équipes** : renommer, changer la couleur, réordonner, ajouter/supprimer, nouvelle partie.
- Effets sonores (bouton ♪ pour couper), écran maintenu allumé (☀), plein écran (⛶ ;
  sur iPhone, ajouter l'app à l'écran d'accueil via Partager).
- Chaque partie est sauvegardée automatiquement dans le navigateur ; fonctionne hors ligne.

## Déploiement GitHub Pages

Site 100 % statique, sans build. Dans *Settings → Pages*, choisir
« Deploy from a branch », la branche `main` et le dossier `/ (root)`.
