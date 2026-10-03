# DoseCircle : tout configurer, de zéro jusqu'aux stores

Ce guide part de **rien** et suit l'ordre où chaque étape débloque la suivante. Coche les
cases au fur et à mesure. Les autres guides (`SUPABASE.md`, `PUBLICATION.md`…) donnent le
détail ; ici tu as **l'ordre** et **le pourquoi**.

**Durée totale** : ~3 à 5 jours de travail effectif, étalés sur 2 à 4 semaines (attentes de
validation Apple/Google). **Coût de départ** : ~10 €/an (nom de domaine), tes comptes
Apple et Google existent déjà. Tout le reste est gratuit au départ.

> 🔐 **Règle d'or** : un mot de passe, une clé « secret » ou un fichier JSON de compte de
> service ne va **jamais** dans le code, ni dans un message, ni dans une capture. Range-les
> dans un gestionnaire de mots de passe (Bitwarden, gratuit).

---

## Phase 0 — Préparer l'ordinateur (1 h)

_Analogie : avant de cuisiner, on sort les ustensiles._

- [ ] **Node.js** (version LTS) : [nodejs.org](https://nodejs.org) → bouton « LTS » →
      installe. C'est le moteur qui fait tourner les outils du projet.
- [ ] **Git** : [git-scm.com](https://git-scm.com) → installe. C'est l'outil qui récupère et
      enregistre le code.
- [ ] **VS Code** : [code.visualstudio.com](https://code.visualstudio.com). L'éditeur pour
      ouvrir les fichiers.
- [ ] Ouvre un **terminal** (Mac : app « Terminal » ; Windows : « PowerShell ») et vérifie :

| Commande        | À quoi ça sert                                        |
| --------------- | ----------------------------------------------------- |
| `node -v`       | Affiche la version de Node (doit commencer par v20+). |
| `git --version` | Vérifie que Git est installé.                         |

- [ ] **Récupérer le code** :

| Commande                                                                                      | À quoi ça sert                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `git clone -b claude/medication-reminder-app-z7zz8c https://github.com/Seyli42/Le-Cercle.git` | Télécharge le projet sur ton ordinateur.                           |
| `cd Le-Cercle`                                                                                | Entre dans le dossier du projet.                                   |
| `npm install`                                                                                 | Installe toutes les bibliothèques dont l'app a besoin (~3 min).    |
| `cp .env.example .env` (Windows : `copy .env.example .env`)                                   | Crée ton fichier de réglages personnel (jamais envoyé sur GitHub). |
| `npm run check`                                                                               | Lance tous les tests : tout doit être vert.                        |

---

## Phase 1 — Créer les comptes gratuits (1 h)

Utilise **une adresse e-mail pro dédiée** (ex. `contact@dosecircle.app`, voir phase 4 ;
en attendant ton Gmail suffit, tu pourras changer).

| Compte                                                             | À quoi il sert                                     | Coût                         |
| ------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------- |
| [supabase.com](https://supabase.com)                               | Le serveur : comptes, données, alertes aux proches | Gratuit (puis ~25 $/mois)    |
| [expo.dev](https://expo.dev)                                       | Fabrique l'app dans le cloud (pas besoin de Mac)   | Gratuit                      |
| [sentry.io](https://sentry.io)                                     | Te prévient quand l'app plante chez quelqu'un      | Gratuit                      |
| [console.firebase.google.com](https://console.firebase.google.com) | Notifications Android des proches                  | Gratuit                      |
| [admob.google.com](https://admob.google.com)                       | La publicité (tes revenus version gratuite)        | Gratuit                      |
| [revenuecat.com](https://revenuecat.com)                           | Gère l'abonnement Premium                          | Gratuit jusqu'à 2 500 $/mois |
| [brevo.com](https://brevo.com)                                     | Envoie les e-mails de code de connexion            | Gratuit (300 e-mails/jour)   |
| Apple Developer / Google Play Console                              | ✅ Tu les as déjà                                  | —                            |

---

## Phase 2 — Le serveur de TEST (Supabase) (30 min)

_Analogie : on construit d'abord une maquette pour tester, la vraie maison viendra après._

Suis **[`SUPABASE.md`](SUPABASE.md)**, sections 1 à 4 et 6 :

- [ ] Créer le projet **« dosecircle-test »**, région **Europe (Paris ou Frankfurt)**.
- [ ] Coller l'URL et la clé **Publishable** dans `.env`.
- [ ] `npx supabase login`, puis `npm run db:link -- --project-ref <REF>`, puis
      `npm run db:push` (crée les tables).
- [ ] Réglages e-mail : code à 6 chiffres, modèle d'e-mail `supabase/templates/code.html`.
- [ ] Activer le **blocage des mots de passe** (hook `custom_access_token_hook`).

---

## Phase 3 — Voir l'app sur ton téléphone (1 h)

**3a. Rapide (Expo Go)** : pour regarder les écrans.

- [ ] Installe l'app **Expo Go** sur ton téléphone (App Store / Play Store).
- [ ] `npm start -- --clear` (lance le serveur de développement), scanne le QR code.
- [ ] Connecte-toi avec ton e-mail et le code reçu, ajoute un médicament.

**3b. Vraie version de test** (indispensable pour tester les rappels, la pub, le Premium) :
suis **[`BUILD.md`](BUILD.md)**.

- [ ] `npx eas-cli@latest login` puis `npx eas-cli@latest init` (relie le projet à expo.dev).
- [ ] Colle l'identifiant affiché dans `app.config.ts` : `const EAS_PROJECT_ID = '…';`
- [ ] Sur expo.dev → projet → **Environment variables** → environnement _development_ :
      `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
      `EXPO_PUBLIC_APP_ENV=development`.
- [ ] `npx eas-cli@latest build --profile development --platform android` (~15 min), installe
      via le QR code.
- [ ] Teste les rappels avec le protocole de [`RAPPELS.md`](RAPPELS.md) (téléphone
      verrouillé, mode avion, redémarrage). **C'est le cœur de l'app : prends ton temps.**

---

## Phase 4 — Nom de domaine, e-mails, site web (2 h)

_Pourquoi : Apple et Google exigent une page « confidentialité » et une page « supprimer
mon compte » en ligne. Et les codes de connexion doivent partir d'une vraie adresse._

- [ ] **Acheter le domaine** `dosecircle.app` (ou `.com` / `.fr`) sur Hostinger (~10-15 €/an).
- [ ] **Hébergement** : ton offre Hostinger actuelle suffit (le site est en simples pages HTML).
- [ ] **Adresse e-mail** `contact@dosecircle.app` (Hostinger → E-mails).
- [ ] **Brevo** : ajoute et vérifie ton domaine (Brevo te donne des lignes DNS à coller dans
      Hostinger → Domaines → DNS). Puis Brevo → SMTP & API → récupère les identifiants SMTP.
- [ ] Supabase **test** → Authentication → Emails → **SMTP Settings** : colle ces
      identifiants, expéditeur `no-reply@dosecircle.app`. ([`SUPABASE.md`](SUPABASE.md) §5)
- [ ] **Site** : remplis `website/site.json` (nom de ta société, e-mail) et les `[crochets]` de
      `docs/PRIVACY.md`, `docs/PRIVACY.en.md`, `website/pages/mentions-legales.md`,
      `website/pages/en/legal.md`.
- [ ] `npm run website:build` (génère le site et **liste ce qui manque encore**).
- [ ] Hostinger → Gestionnaire de fichiers → `public_html` → envoie **tout le contenu** de
      `website/dist`. Vérifie `https://dosecircle.app/confidentialite.html` dans le navigateur.
- [ ] 💼 Fais relire la politique de confidentialité par un juriste (données de santé).

---

## Phase 5 — Sentry : être prévenu des plantages (20 min)

- [ ] Sentry → **Create project** → plateforme **React Native** → nom `dosecircle`.
- [ ] Récupère le **DSN** (Settings → Client Keys) → c'est `EXPO_PUBLIC_SENTRY_DSN`.
- [ ] Note l'**organisation** et le **projet** (`SENTRY_ORG`, `SENTRY_PROJECT`), puis
      Settings → Auth Tokens → crée un jeton → `SENTRY_AUTH_TOKEN` (**secret**).

---

## Phase 6 — Le serveur de PRODUCTION (1 h)

_La « vraie maison » : un deuxième projet Supabase, séparé du test. Si tu casses quelque
chose en test, tes vrais utilisateurs ne voient rien._

- [ ] Refais la **phase 2** avec un projet **« dosecircle-prod »** (région Europe), et le
      SMTP Brevo de la phase 4.
- [ ] Mets les fonctions serveur en ligne et range les secrets
      ([`PUBLICATION.md`](PUBLICATION.md) §1) :

| Commande                                           | À quoi ça sert                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run db:link -- --project-ref <REF_PROD>`      | Relie le dossier au projet de **production**.                            |
| `npm run db:push`                                  | Crée les tables en production.                                           |
| `npm run functions:deploy`                         | Met en ligne les fonctions (alertes aux proches, suppression de compte). |
| `openssl rand -hex 32`                             | Génère un mot de passe aléatoire pour la tâche automatique.              |
| `npx supabase secrets set CRON_SECRET=<la valeur>` | Range ce mot de passe côté serveur.                                      |

- [ ] **Détection des oublis toutes les 5 min** : Supabase → Database → Extensions → active
      `pg_cron` et `pg_net`. Puis SQL Editor → colle `supabase/setup/cron.sql` en
      remplaçant `<PROJECT_REF>` et `<CRON_SECRET>` → **Run**.
      ([`CERCLE.md`](CERCLE.md))
- [ ] **Compte de démonstration** pour les vérificateurs Apple/Google
      ([`PUBLICATION.md`](PUBLICATION.md) §2) : créer l'utilisateur, l'autoriser par SQL,
      ajouter 2-3 médicaments fictifs.

> ⚠️ Pour revenir travailler sur le projet de test : `npm run db:link -- --project-ref <REF_TEST>`.

---

## Phase 7 — Notifications des proches (30 min)

- [ ] **Android (Firebase)** : suis [`CERCLE.md`](CERCLE.md) → « Mise en service » : créer le
      projet Firebase, app Android `com.dosecircle.app`, poser `google-services.json` à la
      racine, envoyer la clé de compte de service à EAS (`npx eas-cli@latest credentials`).
- [ ] **iPhone** : rien à faire maintenant. Au premier build iOS, réponds **Yes** quand EAS
      propose de configurer les notifications push.
- [ ] Test à deux téléphones (toi + un proche) : section « Tester » de [`CERCLE.md`](CERCLE.md).

---

## Phase 8 — Créer l'app dans les stores (1 h)

_Il faut que l'app « existe » chez Apple et Google avant de brancher la pub et
l'abonnement._

- [ ] **App Store Connect** → Apps → **+** : iOS, nom « DoseCircle – Rappel médicament »,
      langue principale Français, identifiant `com.dosecircle.app`, SKU `dosecircle-ios`.
- [ ] **Play Console** → Créer une application : « DoseCircle – Rappel médicament »,
      Français, Application, Gratuite.
- [ ] **Abonnements** (le Premium), mêmes identifiants des deux côtés :
      `premium_monthly` et `premium_yearly` ([`MONETISATION.md`](MONETISATION.md) §4).
      Côté Apple : Accords, taxes et banque → signe l'accord « Apps payantes » et ajoute ton
      IBAN, sinon les abonnements ne marchent pas.

---

## Phase 9 — Brancher la pub et le Premium (1 h 30)

- [ ] **AdMob** : [`MONETISATION.md`](MONETISATION.md) §3 → 2 applications, 4 blocs
      d'annonces, message de consentement européen, **blocage des catégories sensibles**
      (médicaments, santé, rencontres, jeux d'argent…).
- [ ] Remplace `pub-0000000000000000` dans `website/site.json` par ton ID éditeur, refais
      `npm run website:build` et renvoie `app-ads.txt` sur Hostinger.
- [ ] **RevenueCat** : [`MONETISATION.md`](MONETISATION.md) §4 → projet, apps iOS + Android,
      entitlement **`premium`** (exactement ce nom), offering « default ».
- [ ] `npx supabase secrets set REVENUECAT_SECRET_API_KEY=sk_…` (secret, côté serveur seulement).

---

## Phase 10 — Les variables de production dans EAS (20 min)

expo.dev → projet → **Environment variables** → environnement **production**. La liste
complète est dans [`PUBLICATION.md`](PUBLICATION.md) §3 :

- [ ] `EXPO_PUBLIC_APP_ENV=production`
- [ ] `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (projet **prod**)
- [ ] `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (**Secret**)
- [ ] `EXPO_PUBLIC_REVIEW_EMAIL` (adresse du compte démo, **pas** le mot de passe)
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- [ ] `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID` et les 4 `EXPO_PUBLIC_ADMOB_*`

L'app refuse de démarrer en production s'il manque Supabase ou Sentry : un oubli se voit
tout de suite.

---

## Phase 11 — Premières versions de test (1 jour, attentes comprises)

- [ ] **iPhone** : `npx eas-cli@latest build --profile production --platform ios` puis
      `npx eas-cli@latest submit --platform ios --latest` → l'app arrive dans **TestFlight**.
- [ ] **Android** : `npx eas-cli@latest build --profile production --platform android`, puis
      **la première fois à la main** : télécharge le `.aab` sur expo.dev → Play Console →
      Tests internes → Créer une release.
- [ ] Sur les **vrais** téléphones : rappels ([`RAPPELS.md`](RAPPELS.md)), achat de test
      Sandbox (aucune pub ensuite), alerte à un proche, suppression de compte.
- [ ] Coche la liste de [`PUBLICATION.md`](PUBLICATION.md) §8.

---

## Phase 12 — Fiches des stores et envoi en revue (1 jour)

- [ ] **Captures d'écran** avec le compte démo (sans pub visible).
- [ ] Textes : `store/listing.fr.json` + les 10 autres langues ([`LANGUES.md`](LANGUES.md)).
- [ ] Questionnaires (confidentialité, âge, santé, publicité) : réponses toutes prêtes dans
      [`STORES.md`](STORES.md).
- [ ] Icône `store/icon-512.png`, visuel `store/feature-graphic.png`.
- [ ] URL confidentialité `https://dosecircle.app/confidentialite.html` (et `/en/privacy.html`).
- [ ] Notes de revue : adresse + mot de passe du compte démo.
- [ ] **Apple** : Distribution → + Version → Ajouter pour vérification (1 à 3 jours).
- [ ] **Google** : Test interne → Production. (Compte personnel récent : 12 testeurs
      pendant 14 jours d'abord.)
- [ ] 💼 Fais relire les traductions juridiques et médicales par des natifs ([`LANGUES.md`](LANGUES.md)).

---

## Phase 13 — Après la sortie

- [ ] Surveille Sentry les premiers jours.
- [ ] Corrections rapides sans nouvelle revue : [`PUBLICATION.md`](PUBLICATION.md) §7.
- [ ] Automatiser les sorties depuis GitHub : secret `EXPO_TOKEN` + Actions → Release.
- [ ] 💼 **B2B** : offrir le Premium à une pharmacie ou un EHPAD ([`MONETISATION.md`](MONETISATION.md) §5).
      Pour le B2B santé, prévois un hébergeur certifié **HDS** ([`PUBLICATION.md`](PUBLICATION.md) §9).

---

## Où ranger quoi (récapitulatif)

| Valeur                                          | Où                                             | Secret ? |
| ----------------------------------------------- | ---------------------------------------------- | -------- |
| `EXPO_PUBLIC_…` (URL Supabase, clés publiques)  | `.env` (dev) et EAS (production)               | Non      |
| `SENTRY_AUTH_TOKEN`                             | EAS, visibilité **Secret**                     | **Oui**  |
| `CRON_SECRET`, `REVENUECAT_SECRET_API_KEY`      | `npx supabase secrets set …`                   | **Oui**  |
| Clé de compte de service Firebase / Google Play | EAS credentials / dossier `secrets/`           | **Oui**  |
| Mot de passe du compte démo                     | Gestionnaire de mots de passe + notes de revue | **Oui**  |
| `google-services.json`                          | Racine du projet                               | Non      |
