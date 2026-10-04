# Mettre en place Supabase (étape 2)

Temps estimé : 15 minutes. À faire une seule fois par environnement (un projet pour les
tests, un projet pour la production).

## 1. Créer le projet

1. Allez sur [supabase.com](https://supabase.com) → **New project**.
2. **Region** : choisissez une région en Europe (ex. _Paris_ ou _Frankfurt_). Les données de
   santé de vos utilisateurs restent ainsi dans l'UE (RGPD). Ce choix est définitif.
3. Notez le **Database password** dans un gestionnaire de mots de passe (jamais dans le code).

## 2. Brancher l'app

Dans Supabase : **Project Settings → API Keys**.

1. Copiez l'**URL du projet** et la clé **Publishable** (`sb_publishable_…`).
2. Collez-les dans votre fichier `.env` :
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
3. ⚠️ Ne copiez **jamais** la clé _secret_ / _service_role_ dans `.env` : l'app refuse de
   démarrer si vous le faites.

## 3. Créer les tables

| Commande                                 | À quoi ça sert                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `npx supabase login`                     | Connecte votre ordinateur à votre compte Supabase (ouvre le navigateur).      |
| `npm run db:link -- --project-ref <REF>` | Relie ce dossier à votre projet (`<REF>` = Project Settings → General).       |
| `npm run db:push`                        | Envoie les tables et les règles de sécurité (`supabase/migrations`) en ligne. |

Vérification : **Table Editor** doit montrer `profiles`, `medications`, `schedules`,
`dose_events`, `circle_links`, `circle_invites`, `circle_invite_attempts`, `circle_alerts`,
`push_tokens`, `premium_grants`, chacune avec le badge **RLS enabled**.

## 4. Connexion par code e-mail

**Authentication → Sign In / Providers → Email** :

- **Enable Email provider** : activé.
- **Email OTP Length** : `6`.
- **Email OTP Expiration** : `600` secondes (10 min).

**Authentication → Emails → Templates** : dans **Magic Link** _et_ **Confirm signup**,
remplacez le sujet et le contenu par ceux de `supabase/templates/code.html`
(sujet : `DoseCircle · {{ .Token }}`, identique dans toutes les langues ; le contenu, lui,
suit la langue de l'utilisateur, voir `docs/LANGUES.md`). Le contenu doit contenir `{{ .Token }}` :
c'est le code à 6 chiffres. Sans cela, l'utilisateur reçoit un lien au lieu d'un code.

**Authentication → Rate Limits** : laissez les valeurs par défaut.

### Bloquer la connexion par mot de passe (sécurité, obligatoire)

Supabase accepte par défaut les inscriptions « e-mail + mot de passe », que l'app n'utilise
pas. Sans ce réglage, quelqu'un pourrait créer à l'avance un compte avec l'adresse d'une
autre personne et un mot de passe, puis lire ses données le jour où elle utilise l'app.

1. `npm run db:push` (crée la fonction `custom_access_token_hook`).
2. **Authentication → Hooks → Customize Access Token (JWT) Claims** → **Postgres** →
   schéma `public`, fonction `custom_access_token_hook` → **Enable**.
3. **Authentication → Sign In / Providers → Email** : **Minimum password length** `12`,
   **Password requirements** : lettres minuscules, majuscules, chiffres et symboles.

Seul le compte de démonstration des stores pourra utiliser un mot de passe
(`docs/PUBLICATION.md`, étape 2). Testé par `supabase/tests/database/auth_hardening.test.sql`.

## 5. E-mails en production (obligatoire avant le lancement)

Le serveur d'e-mail fourni par Supabase est limité à quelques envois par heure : suffisant
pour tester, pas pour de vrais utilisateurs. Avant le lancement :
**Authentication → Emails → SMTP Settings** → branchez un service d'envoi (Brevo, Resend,
Postmark…) avec une adresse de votre domaine (ex. `no-reply@dosecircle.app`).

## 6. Tester

1. `npm start -- --clear` (le `--clear` force la relecture du `.env`).
2. Saisissez votre e-mail, cochez la case, **Recevoir mon code**.
3. Saisissez le code reçu → vous arrivez sur l'accueil.
4. Fermez complètement l'app, coupez le Wi-Fi et les données, rouvrez-la : vous êtes
   toujours connecté.
5. Dans Supabase → **Table Editor → profiles** : une ligne avec `health_data_consent_at` rempli.

## Tests de sécurité de la base

`npm run test:db` rejoue les migrations et 31 tests de sécurité sur un Postgres local
(ou `npx supabase test db` si Docker est installé). La CI GitHub les lance à chaque push.
