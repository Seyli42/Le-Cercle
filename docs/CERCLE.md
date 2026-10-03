# Le Cercle : alerter les proches (étape 6)

## En clair

1. La personne ajoute jusqu'à **5 proches** (prénom + portable) dans « Mon Cercle ».
2. Chaque proche reçoit un SMS d'invitation et doit répondre **OUI** (avec le code reçu).
   Sans cette réponse, il ne reçoit **jamais** d'alerte (consentement RGPD et anti-spam).
3. Toutes les 5 minutes, le serveur cherche les prises prévues mais **non confirmées** après
   le délai choisi (15 min, 30 min, 1 h ou 2 h).
4. Chaque proche ayant accepté reçoit **un seul** SMS par prise :

   > Le Cercle : Marie n'a pas confirmé sa prise de 08:00. Son téléphone s'est connecté pour la
   > dernière fois à 07:45. Il peut s'agir d'un oubli ou d'un souci de téléphone : pensez à
   > prendre de ses nouvelles.

5. Le proche peut répondre **STOP** à tout moment : il sort de tous les Cercles.
   Twilio bloque alors aussi tout envoi vers ce numéro : pour revenir, le proche doit
   d'abord envoyer **START**, puis accepter une nouvelle invitation.

**Jamais le nom d'un médicament dans un SMS** (secret médical).

## Garde-fous

| Risque                                              | Protection                                                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMS envoyés à un inconnu                            | Alerte uniquement après « OUI » du proche lui-même.                                                                                                                   |
| « OUI » qui valide le mauvais Cercle                | Code à 4 chiffres exigé si plusieurs invitations en attente.                                                                                                          |
| Faux webhook (quelqu'un se fait passer pour Twilio) | Signature Twilio vérifiée, sinon refus (403).                                                                                                                         |
| Deux SMS pour la même prise                         | Contrainte unique + verrouillage (`SKIP LOCKED`) côté SQL.                                                                                                            |
| Avalanche de SMS (coût, harcèlement)                | 6 alertes max / 24 h par personne ; 5 invitations max / proche ; 2 min entre deux invitations.                                                                        |
| Prise faite **hors ligne** mais alerte envoyée      | Inévitable si le téléphone n'a pas de réseau ; le SMS l'explique et donne l'heure de dernière connexion. Dès le retour du réseau, « Pris » remplace « non confirmé ». |
| Proche qui a dit STOP / prise confirmée entre-temps | Alerte en attente annulée.                                                                                                                                            |
| Échec Twilio passager                               | 3 essais maximum, résultat enregistré (`alerts_sent`).                                                                                                                |
| Changement d'heure / fuseau                         | Calcul dans le fuseau du téléphone (envoyé à chaque synchro).                                                                                                         |

## Mise en service (une fois)

### 1. Twilio

1. Créez un compte sur [twilio.com](https://www.twilio.com) et ajoutez du crédit.
2. Achetez un **numéro capable d'envoyer ET de recevoir des SMS** (nécessaire pour les
   réponses OUI / STOP). Pour un numéro mobile français, Twilio demande un dossier
   réglementaire (pièce d'identité / Kbis) : comptez quelques jours de validation.
   Un expéditeur alphanumérique (« LeCercle ») ne peut pas recevoir de réponse : il ne
   convient donc pas ici.
3. Dans la configuration du numéro → **Messaging** → _A message comes in_ : Webhook, POST,
   `https://<PROJECT_REF>.supabase.co/functions/v1/twilio-inbound`.

### 2. Secrets serveur

| Commande                                               | À quoi ça sert                                      |
| ------------------------------------------------------ | --------------------------------------------------- |
| `openssl rand -hex 32`                                 | Génère un secret aléatoire pour la tâche planifiée. |
| `npx supabase secrets set TWILIO_ACCOUNT_SID=AC…`      | Identifiant du compte Twilio.                       |
| `npx supabase secrets set TWILIO_AUTH_TOKEN=…`         | Clé secrète Twilio (jamais dans l'app).             |
| `npx supabase secrets set TWILIO_FROM_NUMBER=+33…`     | Le numéro Twilio acheté.                            |
| `npx supabase secrets set CRON_SECRET=<secret généré>` | Protège la fonction de détection.                   |

### 3. Base et fonctions

| Commande                   | À quoi ça sert                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run db:push`          | Crée les nouvelles colonnes et fonctions SQL du Cercle.                                        |
| `npm run functions:deploy` | Met en ligne les 3 fonctions serveur (`circle-invite`, `twilio-inbound`, `missed-dose-check`). |

### 4. Détection toutes les 5 minutes

Dans Supabase → **Database → Extensions**, activez `pg_cron` et `pg_net`. Puis ouvrez
**SQL Editor**, collez `supabase/setup/cron.sql`, remplacez `<PROJECT_REF>` et
`<CRON_SECRET>`, exécutez.

Vérification : `select * from cron.job_run_details order by start_time desc limit 5;`

## Tester

1. Dans l'app : « Mon Cercle » → votre prénom → ajoutez votre propre second numéro.
2. Répondez `OUI 1234` (le code reçu) → le statut passe à « ✓ A accepté ».
3. Ajoutez un médicament avec une prise dans 2 minutes, délai 15 min, ne répondez pas au
   rappel → environ 15 à 20 minutes après, le SMS d'alerte arrive.
4. Répondez `STOP` → le statut passe à « A refusé ».

## Coûts (ordre de grandeur, à vérifier sur twilio.com)

- Numéro mobile français : environ 1 à 5 € / mois.
- SMS vers un mobile français : environ 0,07 à 0,09 € l'unité (texte de 160 caractères,
  sans accents rares : les textes de l'app sont optimisés pour tenir dans ce format).
- Exemple : 1 000 patients, 2 alertes/mois chacun, 1,5 proche en moyenne → ~3 000 SMS ≈
  250 € / mois. À intégrer dans le prix de l'abonnement B2B (licence par patient).

## Code

| Fichier                                   | Rôle                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/…_circle.sql`        | Consentement, détection des prises non confirmées.             |
| `supabase/tests/database/circle.test.sql` | 30 tests (consentement, alertes, plafonds, STOP, heure d'été). |
| `supabase/functions/circle-invite/`       | Envoie le SMS d'invitation (session de l'utilisateur).         |
| `supabase/functions/twilio-inbound/`      | Reçoit OUI / STOP (signature Twilio vérifiée).                 |
| `supabase/functions/missed-dose-check/`   | Envoie les alertes (appelée par pg_cron).                      |
| `supabase/functions/_shared/`             | Textes SMS, lecture des réponses, client Twilio (testés).      |
| `src/app/(app)/circle.tsx`                | Écran « Mon Cercle ».                                          |
