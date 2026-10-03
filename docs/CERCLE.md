# Mon Cercle : les proches prévenus par notification

## En clair

1. Dans « Mon Cercle », la personne touche **Inviter un proche** : l'app crée un code de
   8 caractères (ex. `ABCD-EFGH`), valable 48 h, utilisable une seule fois.
2. Elle l'envoie avec **Partager l'invitation** (WhatsApp, SMS depuis son propre téléphone,
   e-mail…).
3. Le proche installe DoseCircle (gratuit), se connecte, ouvre « Mon Cercle » →
   **Je veille sur un proche** et saisit le code. **Saisir le code = donner son accord.**
4. Toutes les 5 minutes, le serveur cherche les prises prévues mais **non confirmées**
   après le délai choisi (15 min à 2 h, 30 min par défaut).
5. Chaque proche reçoit **une seule** notification par prise, sur tous ses téléphones :
   « Marie n'a pas confirmé sa prise — Prise prévue à 08:00… ». Jamais le nom du médicament.
6. Chacun peut arrêter à tout moment : la personne (**Retirer**) ou le proche
   (**Ne plus veiller**).

**Coût : zéro.** Les notifications passent par le service gratuit d'Expo, qui les relaie à
Apple et Google (gratuits aussi). Plus de Twilio, plus de SMS facturés.

## Garde-fous

| Risque                                               | Protection (testée dans `circle.test.sql`)                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Quelqu'un rejoint un Cercle sans y être invité       | Seul un code valable permet d'entrer ; aucune écriture directe possible.                       |
| Deviner un code                                      | 32⁸ ≈ 1 000 milliards de codes ; 10 erreurs par heure maximum ; code 48 h.                     |
| Ancien code qui traîne                               | Un nouveau code annule le précédent ; usage unique.                                            |
| Trop d'alertes                                       | 1 par proche et par prise, 6 par jour maximum, 5 proches maximum.                              |
| Alerte alors que la prise a été confirmée hors ligne | Annulée dès que la réponse arrive ; la réponse du téléphone l'emporte.                         |
| Proche parti, téléphone désinstallé                  | Alertes en attente annulées ; téléphones inconnus d'Apple / Google oubliés.                    |
| Téléphone prêté / tablette familiale                 | Le téléphone reçoit les alertes du **dernier** compte connecté ; déconnexion = plus d'alertes. |
| Secret médical                                       | Seuls le prénom et l'heure prévue sont envoyés.                                                |
| Changement d'heure                                   | Prises calculées dans le fuseau du téléphone de la personne.                                   |

## Mise en service (une fois)

Les notifications « à distance » demandent des identifiants Apple et Google, gratuits.

**Android (Firebase)**

1. [console.firebase.google.com](https://console.firebase.google.com) → **Ajouter un projet**
   « DoseCircle » (Google Analytics : inutile).
2. **Ajouter une application Android**, nom du package `com.dosecircle.app`.
3. Téléchargez `google-services.json` et placez-le **à la racine du projet** (il ne contient
   que des identifiants publics : il peut être versionné).
4. Firebase → Paramètres du projet → **Comptes de service** → **Générer une nouvelle clé
   privée** (fichier JSON **secret** : jamais dans git).
5. `npx eas-cli@latest credentials` → Android → production → **Google Service Account** →
   **Upload a new service account key** → choisissez ce fichier.

**iPhone (APNs)** : rien à faire à la main. Au premier
`npx eas-cli@latest build --profile production --platform ios`, répondez **Yes** quand EAS
propose de configurer les notifications push : il crée la clé Apple pour vous.

**Serveur**

| Commande                                  | À quoi ça sert                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| `npm run db:push`                         | Crée les tables du Cercle (et supprime l'ancien Cercle par SMS).        |
| `npm run functions:deploy`                | Met en ligne `missed-dose-check` (envoi des alertes).                   |
| `openssl rand -hex 32`                    | Génère un secret pour la tâche planifiée.                               |
| `npx supabase secrets set CRON_SECRET=…`  | Protège la fonction de détection.                                       |
| `supabase/setup/cron.sql` dans SQL Editor | Lance la détection toutes les 5 minutes (extensions pg_cron et pg_net). |

Facultatif : `npx supabase secrets set EXPO_ACCESS_TOKEN=…` si vous activez « Enhanced
push security » dans expo.dev (seul votre serveur peut alors envoyer à vos utilisateurs).

## Tester (deux téléphones, deux comptes)

1. Téléphone A (la personne) : « Mon Cercle » → prénom → **Inviter un proche** → partagez.
2. Téléphone B (le proche) : autre compte → « Mon Cercle » → saisissez le code → « Vous
   veillez maintenant sur … ». Autorisez les notifications.
3. Téléphone A : ajoutez un médicament avec une prise dans 2 minutes, délai 15 min, et ne
   répondez pas au rappel.
4. Environ 17 à 20 minutes plus tard, le téléphone B reçoit l'alerte ; la toucher ouvre
   « Mon Cercle ».
5. Téléphone B : **Ne plus veiller** → plus aucune alerte.

## Code

| Fichier                                   | Rôle                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `supabase/migrations/…_circle_push.sql`   | Invitations, liens, téléphones, détection des prises manquées. |
| `supabase/tests/database/circle.test.sql` | 37 tests (codes, accord, plafonds, retrait, heure d'été…).     |
| `supabase/functions/missed-dose-check/`   | Envoie les alertes (appelée par pg_cron).                      |
| `supabase/functions/_shared/push.ts`      | Texte de l'alerte et envoi via Expo (testés).                  |
| `src/features/circle/`                    | Appels serveur, inscription du téléphone aux alertes.          |
| `src/app/(app)/circle.tsx`                | Écran « Mon Cercle ».                                          |
