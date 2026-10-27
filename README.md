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

## Autre jeu (`autre.html`)

Pour garder dans les statistiques une partie jouée sans l'app (tarot, belote, Uno…) :
nom du jeu (les noms déjà utilisés sont proposés), joueurs, puis
- **un seul vainqueur** : on touche le gagnant (1 point, 0 pour les autres) ;
- **aux points** : les points de chacun (± pour un score négatif), le plus haut ou le
  plus bas gagnant.

La partie compte comme les autres dans les statistiques globales, avec une ligne par
nom de jeu dans le détail par jeu.

## Joueurs & statistiques globales (`joueurs.html`)

- Les joueurs sont communs à tous les jeux : nom, couleur et ordre se règlent sur
  cette page (ou dans le menu *Joueurs* d'un jeu, qui les met à jour partout).
  Dans un jeu, on ajoute un joueur de la liste d'un toucher, ou on en crée un nouveau.
- À la scoppa, une équipe est composée de joueurs de la liste : son nom suit ses
  membres (« Alice & Bob ») et la victoire compte pour chacun.
- Chaque partie terminée est enregistrée (dix-mille : bouton « 🏁 Fin » ; yams :
  grille pleine ; scoppa : objectif atteint ; fléchettes : pile à 0). Une annulation
  qui défait la fin retire la partie.
- Statistiques sur les dernières 24 h, les 7 derniers jours, par mois, par année
  (flèches ‹ › pour remonter dans le temps) ou depuis toujours :
  classement (victoires, parties, %), détail par jeu, courbe des victoires cumulées,
  records et liste des dernières parties (une partie peut en être retirée).

- **Classement** à l'indice : victoires ÷ victoires attendues au hasard (selon le nombre
  d'adversaires de chaque partie), avec une partie moyenne ajoutée pour ne pas favoriser
  ceux qui ont peu joué. 1 = dans la moyenne. Les joueurs qui ne jouent pas toujours
  ensemble restent ainsi comparables.
- **Filtre par jeu** (bulles sous les périodes) : toutes les statistiques, faits marquants
  et graphiques ne portent alors que sur ce jeu ; il se combine avec la période.
- **Faits marquants** : plus longue série de victoires, série en cours, plus belle
  journée, grande rivalité, partie la plus serrée, spécialiste d'un jeu, joueur le plus
  assidu, jeu le plus joué, journée la plus chargée.
- **Graphiques** : victoires cumulées, indice de chacun au fil des parties (ligne de la
  moyenne), activité (parties par jour, semaine ou mois), parties par jeu, et tableau
  des duels (victoires–défaites de chaque joueur face à chaque autre).
- **Invités** (« + Invité » dans un jeu ou sur cette page, ou bouton « Invité » d'un
  joueur) : ils jouent normalement mais ne comptent pas dans les statistiques globales.
- **Partage entre téléphones** : bouton « QR » d'un joueur, ou « QR de synchronisation globale » (tous les joueurs et tout l'historique),
  puis « 📷 Scanner un QR code » sur l'autre téléphone. Le joueur y arrive **avec toutes
  ses parties terminées** ; les parties déjà présentes sont reconnues et ignorées, donc
  relire un QR code ne crée jamais de doublon. Un joueur du même nom y devient le même
  joueur (ses parties sont conservées).

  Format : joueurs, jeux et noms d'équipes en dictionnaire, chaque partie réduite à
  `[identifiant, jeu, minute, options, [[joueur, score, tours, équipe]…], [gagnants]]`,
  le tout compressé (deflate) et encodé en base64url, puis découpé en QR codes de
  480 caractères qui défilent tout seuls (`FDS2|envoi|n°|total|z|données`) ; le lecteur
  les collecte dans n'importe quel ordre. Chaque partie terminée porte un identifiant
  aléatoire de 12 caractères (environ 62 bits) qui la rend unique d'un téléphone à
  l'autre. Environ 70 parties tiennent en 6 QR codes.
- **Sauvegarde** : « Exporter » produit un fichier JSON avec tout ce qui est enregistré
  (joueurs, parties en cours, historique) ; « Importer… » remplace les données du
  téléphone par une sauvegarde.

Lecture des QR codes reprise de QRProtec : `BarcodeDetector` natif quand il existe, sinon
zxing-cpp en WebAssembly dans un worker (`decoder.js`), avec jsQR en secours
(`camera-scan.js`). Bibliothèques copiées dans `vendor/` avec leurs licences :
zxing-wasm (MIT), jsQR (Apache 2.0), qrcode-generator (MIT).

## Statistiques de partie

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
