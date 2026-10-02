# Le Cercle — cahier des charges

> Sections 1 à 9 rédigées à partir des règles de la section 0 (fournie par Ilyes).
> Toute modification de périmètre se fait ici d'abord.

## 1. Vision

**Le Cercle** rappelle à une personne de prendre les médicaments qu'elle a saisis, et
prévient son « cercle » (proches aidants) si une prise reste sans réponse.

- **Cible utilisateur** : personnes sous traitement régulier (souvent seniors) et leurs aidants.
- **Cible commerciale (B2B)** : pharmacies, SSIAD, résidences seniors, mutuelles,
  laboratoires (programmes d'observance) — vente en marque blanche ou licence par patient.

## 2. Périmètre fonctionnel (MVP)

1. Compte par code reçu par e-mail (pas de mot de passe à retenir).
2. Fiches médicament : nom, forme, quantité par prise **saisies par l'utilisateur**, horaires,
   jours, date de début/fin, note libre.
3. Rappels locaux fiables : notification à l'heure, actions **Pris / Reporter 10 min / Ignorer**.
4. Historique et taux de prises confirmées (aucune interprétation médicale).
5. Le Cercle : jusqu'à 5 proches ; SMS envoyé si une prise n'est pas confirmée après un délai
   choisi (30 min par défaut).
6. Scan IA d'une ordonnance / boîte : pré-remplit les champs **tels qu'écrits**, l'utilisateur
   valide obligatoirement.
7. Fonctionnement complet hors ligne, synchronisation au retour du réseau.

Hors MVP : multi-profils par appareil, export PDF pour le médecin, objets connectés.

## 3. Règles de sécurité médicale

- L'app ne suggère **jamais** de dose, d'interaction, de substitution ou de diagnostic.
- L'IA ne fait que **recopier** ; le prompt serveur lui interdit tout conseil et le résultat est
  toujours relu par l'utilisateur.
- Mention permanente : « Le Cercle ne donne aucun conseil médical ».
- Le SMS au proche ne contient pas le nom du médicament (secret médical), seulement :
  « [Prénom] n'a pas confirmé sa prise de 08:00 ».

## 4. Fiabilité des rappels (exigence n°1)

- Notifications **programmées localement** sur le téléphone (aucune dépendance au réseau).
- Android : alarmes exactes (`SCHEDULE_EXACT_ALARM`), canal haute priorité, reprogrammation au
  redémarrage et après mise à jour de l'app.
- iOS : limite de 64 notifications en attente → fenêtre glissante replanifiée à chaque ouverture
  et en tâche de fond.
- Écran « Vérifier mes rappels » : état des autorisations, prochain rappel, test immédiat.
- Tests automatisés du calcul des horaires (fuseaux, changement d'heure, fin de traitement).

## 5. Architecture technique

| Couche          | Choix                                                     |
| --------------- | --------------------------------------------------------- |
| App             | Expo SDK 57, React Native, TypeScript strict, Expo Router |
| Données locales | expo-sqlite (source de vérité hors ligne)                 |
| Rappels         | expo-notifications + expo-task-manager / background-task  |
| Backend         | Supabase (Postgres + RLS, Auth OTP, Edge Functions Deno)  |
| IA              | Anthropic Claude via Edge Function `extract-prescription` |
| SMS             | Twilio via Edge Function + cron `missed-dose-check`       |
| Monitoring      | Sentry (données de santé filtrées avant envoi)            |
| Build / stores  | EAS Build, EAS Submit, EAS Update                         |

## 6. Données (Supabase)

`profiles`, `medications`, `schedules`, `dose_events` (prévue / prise / reportée / manquée),
`circle_members`, `alerts_sent`. RLS : chaque utilisateur ne voit que ses lignes. Clés
`service_role`, Anthropic et Twilio uniquement dans les Edge Functions.

## 7. Sécurité & conformité

- Données de santé = données sensibles (RGPD art. 9) : consentement explicite, suppression du
  compte depuis l'app, région UE pour Supabase. En production commerciale : hébergeur
  certifié HDS à prévoir selon le client.
- Aucune donnée de santé dans Sentry (filtrage `beforeSend`).
- Fiches stores : politique de confidentialité, déclaration « Data safety » / « App Privacy ».

## 8. Qualité

- `npm run check` = typage + lint + format + tests, obligatoire avant chaque commit.
- Gestion d'erreurs unifiée (`AppError`) : message clair en français + log Sentry.
- Accessibilité : textes ≥ 18 pt, zones tactiles ≥ 56 pt, libellés lecteur d'écran.

## 9. Étapes

| #   | Étape                     | Livrable principal                                           |
| --- | ------------------------- | ------------------------------------------------------------ |
| 1   | Fondations                | Projet Expo, TS strict, navigation, Sentry, erreurs, tests   |
| 2   | Supabase & connexion      | Schéma + RLS, connexion par code e-mail, session persistée   |
| 3   | Médicaments (hors ligne)  | SQLite local, formulaires, liste, validation                 |
| 4   | Moteur de rappels         | Notifications locales fiables, actions, redémarrage, tests   |
| 5   | Historique & synchro      | Journal des prises, synchronisation SQLite ↔ Supabase        |
| 6   | Le Cercle (aidants + SMS) | Invitations, Edge Function Twilio, détection des oublis      |
| 7   | Scan IA                   | Caméra, Edge Function Claude, écran de vérification          |
| 8   | Finitions                 | Onboarding, accessibilité, suppression de compte, tests E2E  |
| 9   | Publication               | EAS Build/Submit, fiches stores, confidentialité, TestFlight |
