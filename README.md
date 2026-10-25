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

- Grille : As à 6, bonus de 35 points à partir de 63 en haut, brelan et carré (total des 5 dés),
  full (25), petite suite (30), grande suite (40), yams (50), chance.
- Toucher une case : des bulles proposent les choix possibles — nombre de dés (1 à 5)
  pour As à 6, pour le brelan et le carré, une ligne de dés pour la face de la
  combinaison et une ligne par dé restant, valeur fixe pour le full, les
  suites et le yams ; pour la chance, un pavé numérique (total de 5 à 30). `✗ Barrer` met 0, `Autre…` permet une
  valeur libre, `Vider` efface la case.
- Le tour passe au joueur suivant dès qu'une case vide est remplie (toucher un nom
  en haut d'une colonne choisit qui joue) ; la colonne du
  joueur dont c'est le tour est surlignée. Totaux et bonus calculés automatiquement.

## Scoppa (`scoppa.html`)

- Saisie manche par manche : pour chaque équipe, un bouton par point
  (carte, denari, settebello, primiera) — un seul gagnant possible par point,
  aucun en cas d'égalité — et un compteur −/+ pour les scope.
- Bouton « 🧮 Calculer » sur la primiera : pour chaque équipe, on touche la meilleure
  carte de chaque couleur (7 = 21, 6 = 18, 1 = 16, 5 = 15, 4 = 14, 3 = 13, 2 = 12,
  têtes = 10) ; le meilleur total gagne la primiera (une équipe à qui il manque une
  couleur ne peut pas la gagner, égalité = personne).
- « Valider la manche » ajoute les points au total ; les manches jouées restent
  listées et peuvent être modifiées (✎) ou supprimées (✕).
- Score à atteindre au choix (11, 16, 21 ou 31) dans le menu *Équipes* ; l'équipe
  seule en tête au-delà de l'objectif gagne.

## Fléchettes (`flechettes.html`)

- Départ à 301, 501 ou 701 (menu *Joueurs*) ; on tape le total de chaque volée
  (180 au maximum), qui est retiré du score.
- Il faut arriver **exactement à 0** : une volée qui ferait passer sous 0 est
  annulée (« dépassé ») et la main passe au joueur suivant.

## Statistiques

À la fin de la partie, un écran de statistiques s'ouvre (aussi accessible à tout
moment depuis le menu *Joueurs / Équipes*) :

- un graphique de progression du score cumulé de chacun, tour par tour (ou manche
  par manche), avec la ligne d'objectif ; toucher le graphique affiche les scores ;
- un tableau récapitulatif : tours joués, tour du 10 000, moyenne, meilleur tour et
  tours à 0 au dix-mille ; haut, bonus, bas, combinaisons, yams et cases barrées au
  yams ; manches gagnées, meilleure manche et répartition des points à la scoppa.

Fin de partie : au dix-mille, c'est vous qui décidez avec le bouton « 🏁 Fin »,
qui apparaît dès qu'un joueur atteint 10 000 (celui qui passe 10 000 peut donner sa
main au suivant, qui la continue) ; au yams, quand la grille est pleine ; à la scoppa, quand une
équipe est seule en tête au-delà de l'objectif. Les graphiques sont dessinés en SVG
par `stats.js`, sans bibliothèque externe.

## Commun

- Bouton **Joueurs / Équipes** : renommer, changer la couleur, réordonner, ajouter/supprimer, nouvelle partie.
- Effets sonores (bouton ♪ pour couper), écran maintenu allumé (☀), plein écran (⛶ ;
  sur iPhone, ajouter l'app à l'écran d'accueil via Partager).
- Chaque partie est sauvegardée automatiquement dans le navigateur ; fonctionne hors ligne.

## Déploiement GitHub Pages

Site 100 % statique, sans build. Dans *Settings → Pages*, choisir
« Deploy from a branch », la branche `main` et le dossier `/ (root)`.
