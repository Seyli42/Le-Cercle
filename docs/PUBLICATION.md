# Publier DoseCircle sur l'App Store et Google Play (étape 9)

Comptez **2 à 4 semaines** la première fois : vérification des comptes développeur, revue
Apple (souvent 1 à 3 jours, parfois plusieurs allers-retours pour une app de santé) et,
selon votre compte Google, 14 jours de test fermé obligatoire.

Chaque commande est expliquée. Faites les étapes **dans l'ordre**.

## 0. Les comptes (une seule fois)

| Compte                       | Coût                    | Remarque                                                                                                                                                    |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program      | 99 €/an                 | Prenez un compte **Organisation** (nécessite un numéro D-U-N-S, gratuit, ~1 semaine) : le nom de votre société apparaît sur le store, plus crédible en B2B. |
| Google Play Console          | 25 $ une fois           | Compte **Organisation** aussi. Un compte **personnel** récent doit faire tester l'app par **12 testeurs pendant 14 jours** avant de pouvoir publier.        |
| expo.dev                     | Gratuit au départ       | Construit l'app dans le cloud (pas besoin de Mac).                                                                                                          |
| Supabase (projet production) | Gratuit puis ~25 $/mois | Région **Europe**. Voir `docs/SUPABASE.md`.                                                                                                                 |
| Sentry, Firebase             | Gratuits au départ      | Plantages ; notifications Android du Cercle (`docs/CERCLE.md`).                                                                                             |
| AdMob, RevenueCat            | Gratuits                | Voir `docs/MONETISATION.md`.                                                                                                                                |

## 1. Le serveur de production (Supabase)

| Commande                                               | À quoi ça sert                                                        |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `npm run db:link -- --project-ref <REF>`               | Relie ce dossier au projet **de production**.                         |
| `npm run db:push`                                      | Crée toutes les tables, règles de sécurité et fonctions.              |
| `npm run functions:deploy`                             | Met en ligne les fonctions serveur (alertes du Cercle, suppression…). |
| `npx supabase secrets set NOM=valeur` (une par secret) | Range les clés secrètes (liste dans `.env.example`, partie 3).        |

Puis dans le tableau de bord Supabase :

- **Bloquer les mots de passe** : `docs/SUPABASE.md` → « Bloquer la connexion par mot de
  passe » (**obligatoire**, c'est une protection de sécurité).
- **E-mails** : SMTP de votre domaine (`docs/SUPABASE.md` §5), sinon les codes de connexion
  n'arriveront pas au-delà de quelques personnes par heure.
- **Détection des oublis** : `supabase/setup/cron.sql` (`docs/CERCLE.md`).

## 2. Le compte de démonstration (pour les vérificateurs)

Apple et Google testent l'app, mais ne peuvent pas recevoir vos codes par e-mail. On leur
donne un compte à mot de passe, **le seul autorisé**.

1. Supabase → **Authentication → Users → Add user → Create new user** : une adresse à vous
   (ex. `demo@votredomaine.fr`), un mot de passe fort (12 caractères ou plus, gardé dans
   votre gestionnaire), cochez **Auto Confirm User**.
2. Supabase → **SQL Editor** :
   ```sql
   insert into private.password_sign_in_allowlist (email, reason)
   values ('demo@votredomaine.fr', 'Revue App Store / Google Play');
   ```
3. Déclarez `EXPO_PUBLIC_REVIEW_EMAIL=demo@votredomaine.fr` dans les variables EAS
   (production). L'**adresse** est publique, le **mot de passe** ne va que dans les notes
   de revue des stores.
4. Connectez-vous une fois avec ce compte et ajoutez 2 ou 3 médicaments fictifs, et invitez
   un proche (un 2e compte à vous, sur un autre téléphone) : les vérificateurs verront une app « vivante », et vous vous en
   servirez pour les captures d'écran.

## 3. EAS : relier le projet

| Commande                   | À quoi ça sert                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `npx eas-cli@latest login` | Connecte votre ordinateur à votre compte expo.dev.                    |
| `npx eas-cli@latest init`  | Crée le projet sur expo.dev et affiche son identifiant (`projectId`). |

Collez cet identifiant dans `app.config.ts` : `const EAS_PROJECT_ID = '…';`. C'est ce qui
active les mises à jour à distance (étape 7). Ce n'est pas un secret.

Dans expo.dev → projet → **Environment variables**, environnement **production** :

| Variable                                          | Visibilité | Source                       |
| ------------------------------------------------- | ---------- | ---------------------------- |
| `EXPO_PUBLIC_APP_ENV` = `production`              | Plain text |                              |
| `EXPO_PUBLIC_SUPABASE_URL`, `…_PUBLISHABLE_KEY`   | Plain text | Supabase production          |
| `EXPO_PUBLIC_SENTRY_DSN`                          | Plain text | Sentry (obligatoire en prod) |
| `EXPO_PUBLIC_REVIEW_EMAIL`                        | Plain text | Étape 2                      |
| `EXPO_PUBLIC_REVENUECAT_*`, `EXPO_PUBLIC_ADMOB_*` | Plain text | `docs/MONETISATION.md`       |
| `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID`        | Plain text | AdMob                        |
| `SENTRY_ORG`, `SENTRY_PROJECT`                    | Plain text | Sentry                       |
| `SENTRY_AUTH_TOKEN`                               | **Secret** | Sentry → Auth tokens         |

L'app **refuse de démarrer** en production s'il manque Supabase ou Sentry : un oubli se
voit dès le premier test, pas chez vos utilisateurs.

## 4. Le site web (confidentialité, suppression, support)

1. Remplissez `website/site.json` et les `[crochets]` de `docs/PRIVACY.md` et
   `website/pages/mentions-legales.md` (faites relire la politique par un juriste).
2. `npm run website:build` : génère le site dans `website/dist` et **liste ce qui manque**.
3. Hostinger → **hPanel → Fichiers → Gestionnaire de fichiers** → `public_html` :
   envoyez **tout le contenu** de `website/dist`.
4. Vérifiez dans un navigateur : `/confidentialite.html`, `/suppression-compte.html`,
   `/support.html`, `/mentions-legales.html`, `/app-ads.txt`.

**Demande de suppression par e-mail** (sans l'app) : Supabase → Authentication → Users →
cherchez l'adresse → **Delete user**. Tout est effacé en cascade. Répondez à la personne.

## 5. iPhone : TestFlight puis App Store

1. **App Store Connect → Apps → +** : plateforme iOS, nom « DoseCircle – Rappel
   médicament », langue Français, identifiant `com.dosecircle.app`, SKU `dosecircle-ios`.
2. Remplissez la fiche avec `store/listing.fr.json` et les déclarations de
   `docs/STORES.md` (confidentialité, âge, abonnements, notes de revue).

| Commande                                                       | À quoi ça sert                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npx eas-cli@latest build --profile production --platform ios` | Construit la version store dans le cloud (~20 min). EAS crée certificats et profils pour vous. |
| `npx eas-cli@latest submit --platform ios --latest`            | Envoie ce build à App Store Connect, il apparaît dans **TestFlight** (~15 min de traitement).  |

3. **TestFlight** → ajoutez-vous comme testeur interne, installez l'app TestFlight sur
   l'iPhone, testez (protocole de `docs/RAPPELS.md` + achat Sandbox de `docs/MONETISATION.md`).
4. **Distribution → + Version** → choisissez le build → **Ajouter pour vérification**.

## 6. Android : test interne puis production

1. **Play Console → Créer une application** : nom, Français, Application, Gratuite.
2. Remplissez **Contenu de l'application** et **Fiche Play Store** avec `docs/STORES.md` et
   `store/listing.fr.json` ; icône `store/icon-512.png`, visuel `store/feature-graphic.png`.

| Commande                                                           | À quoi ça sert                                  |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| `npx eas-cli@latest build --profile production --platform android` | Construit le fichier `.aab` attendu par Google. |

3. **La toute première fois, envoyez le fichier à la main** (Google l'exige) : téléchargez
   le `.aab` depuis la page du build sur expo.dev, puis Play Console → **Tests → Tests
   internes → Créer une release** → déposez le fichier.
4. Pour les fois suivantes, automatisez : Play Console → **Configuration → Accès à l'API**
   → compte de service avec le rôle « Gestionnaire des releases » → téléchargez la clé JSON
   dans `secrets/google-play-service-account.json` (dossier ignoré par git).
   Ensuite `npx eas-cli@latest submit --platform android --latest` envoie au test interne.
5. Test interne → (compte personnel : test fermé 12 testeurs / 14 jours) → **Production**.
   Quand l'app est publiée une première fois, passez `releaseStatus` de `draft` à
   `completed` dans `eas.json`.

**Tout en une fois, depuis GitHub** (après les premières versions manuelles) : ajoutez le
secret `EXPO_TOKEN` (expo.dev → Access tokens) dans GitHub → Settings → Secrets, puis
**Actions → Release → Run workflow** (`build`). Les contrôles qualité tournent d'abord :
rien ne part si un test échoue.

## 7. Après la sortie : corriger vite (mises à jour à distance)

Une correction qui ne touche **que le JavaScript** (texte, écran, bug de logique) part sans
nouvelle revue des stores :

| Commande                                                  | À quoi ça sert                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| GitHub → Actions → Release → `update` + message           | Envoie la correction à **10 %** des utilisateurs d'abord.       |
| `npx eas-cli@latest update:edit --rollout-percentage 100` | Si Sentry reste calme (étiquette `update_id`), à tout le monde. |
| `npx eas-cli@latest update:rollback`                      | En cas de problème : retour immédiat à la version précédente.   |

Sécurités intégrées : une mise à jour n'est livrée qu'aux versions **compatibles** (même
code natif, `runtimeVersion: fingerprint`) ; si elle plante au démarrage, l'app revient
seule au code du store et Sentry vous prévient (« emergency launch »). Le démarrage n'attend
jamais le réseau : les rappels ne dépendent pas d'une mise à jour.

Ajouter une bibliothèque native, changer une permission ou une icône = **nouveau build**
et nouvelle revue (étapes 5 et 6).

## 8. Liste de contrôle avant chaque soumission

- [ ] `npm run check`, `npm run test:db`, `npm run test:functions`, `npm run doctor` : tout vert.
- [ ] Protocole de `docs/RAPPELS.md` sur un **vrai** iPhone et un **vrai** Android
      (téléphone verrouillé, mode avion, redémarrage).
- [ ] Connexion par code e-mail en production (SMTP branché) + compte de démonstration.
- [ ] Le hook « mot de passe » est activé (une tentative de connexion par mot de passe avec
      un compte normal doit échouer).
- [ ] Achat Sandbox → plus de pub ; restauration OK ; « Choix publicitaires » visible en Europe.
- [ ] Suppression de compte testée de bout en bout (données disparues dans Supabase).
- [ ] Site en ligne, `[crochets]` remplis, `app-ads.txt` accessible.
- [ ] Captures faites avec le compte de démonstration, sans pub visible.
- [ ] Numéro de version : `version` dans `app.config.ts` (`1.0.0`, puis `1.0.1`, `1.1.0`…).
      Le numéro de build s'incrémente tout seul (EAS, `autoIncrement`).

## 9. Points juridiques à faire valider (non techniques)

- **Politique de confidentialité et mentions légales** : relecture par un juriste.
- **Hébergement de données de santé (HDS)** : en France, héberger des données de santé
  pour le compte de tiers peut exiger un hébergeur certifié HDS ; Supabase ne l'est pas.
  Pour le grand public, faites trancher ce point par un juriste ; **pour le B2B santé
  (pharmacies, établissements), prévoyez un hébergement HDS**, c'est un argument de vente.
- **Dispositif médical** : l'app reste un outil de rappel (aucune analyse, aucune dose
  proposée). Toute fonction qui interpréterait des données de santé (alerte d'interaction,
  calcul de dose) changerait son statut réglementaire (marquage CE) : à ne pas ajouter sans
  avis réglementaire.
- **Chiffrement** : l'app déclare un chiffrement standard (exemption export américaine).
  Si App Store Connect vous pose la question de la **déclaration française (ANSSI)** pour la
  distribution en France, vérifiez avec votre conseil si elle s'applique à votre cas.
- **Mentions légales du site** : vérifiez l'adresse de l'hébergeur dans votre contrat
  Hostinger.
