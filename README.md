# Le Cercle

Application iOS + Android de rappels de médicaments, avec alerte aux proches.
Une seule base de code : Expo / React Native / TypeScript.

- Cahier des charges et étapes : [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md)
- Mise en place de Supabase : [`docs/SUPABASE.md`](docs/SUPABASE.md)
- Moteur de rappels et protocole de test : [`docs/RAPPELS.md`](docs/RAPPELS.md)
- Synchronisation et historique : [`docs/SYNCHRO.md`](docs/SYNCHRO.md)
- Le Cercle (alertes SMS aux proches, Twilio) : [`docs/CERCLE.md`](docs/CERCLE.md)
- Scan d'ordonnance par IA (Claude) : [`docs/SCAN.md`](docs/SCAN.md)
- Installer une vraie version sur son téléphone : [`docs/BUILD.md`](docs/BUILD.md)
- Règles pour les agents IA : [`AGENTS.md`](AGENTS.md)

## Démarrer (première fois)

| Commande               | À quoi ça sert                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm install`          | Télécharge toutes les bibliothèques dont l'app a besoin.               |
| `cp .env.example .env` | Crée votre fichier de configuration local (à remplir, jamais commité). |
| `npm start`            | Lance le serveur de développement et affiche un QR code.               |

Scannez le QR code avec l'app **Expo Go** (iPhone : appareil photo ; Android : app Expo Go).

## Vérifier la qualité

| Commande                 | À quoi ça sert                                                   |
| ------------------------ | ---------------------------------------------------------------- |
| `npm run typecheck`      | Vérifie que les types TypeScript sont cohérents (aucune erreur). |
| `npm run lint`           | Repère le code risqué ou mal écrit.                              |
| `npm test`               | Lance les tests automatiques.                                    |
| `npm run check`          | Fait les trois ci-dessus + le formatage, en une fois.            |
| `npm run doctor`         | Vérifie que la configuration Expo est saine.                     |
| `npm run test:db`        | Teste les tables et la sécurité (nécessite un Postgres local).   |
| `npm run test:functions` | Teste les fonctions serveur (nécessite Deno).                    |

## Structure

```
src/
  app/          Écrans (chaque fichier = une page, géré par Expo Router)
    (app)/      Écrans accessibles une fois connecté
  components/   Éléments d'interface réutilisables
  config/       Configuration publique (variables EXPO_PUBLIC_*)
  features/     Fonctionnalités
    auth/         Connexion par code e-mail
    medications/  Médicaments : validation, stockage local, formulaire, liste
    reminders/    Rappels : planification, notifications, tâches de fond, diagnostic
    sync/         Synchronisation téléphone ↔ Supabase
    history/      Historique des prises
    circle/       Le Cercle : proches prévenus par SMS
    scan/         Scan d'ordonnance : photo, lecture IA, pré-remplissage
    account/      Export des données et suppression du compte (RGPD)
    onboarding/   Écran d'accueil du premier lancement, « Pour bien démarrer »
    monetization/ Publicité (AdMob, règles d'affichage) et Premium (RevenueCat)
  lib/          Logique : erreurs, monitoring (Sentry), client Supabase…
    db/           Base locale chiffrée et ses migrations
  theme/        Couleurs (clair + sombre), tailles, espacements
__tests__/      Tests automatiques (dont appFlow : l'app entière, écran par écran)
docs/           Documentation projet
store/          Textes et visuels des fiches App Store / Google Play
website/        Site public (confidentialité, suppression de compte, support) à héberger
supabase/       Base de données : migrations, tests, fonctions serveur (Twilio), e-mails
scripts/        Outils (test de la base, icônes, génération du site)
modules/        Code natif maison (reminder-health : diagnostic Android des rappels)
```

## Données sur le téléphone

Les médicaments et horaires sont enregistrés **sur le téléphone** (SQLite), ce qui permet à
l'app de fonctionner sans réseau. La base est chiffrée (SQLCipher) avec une clé aléatoire
rangée dans le Keychain (iOS) / Keystore (Android).

> ⚠️ Dans **Expo Go**, la base n'est pas chiffrée (Expo Go n'inclut pas SQLCipher). Le
> chiffrement est actif dans les vraies versions de l'app (build de développement, TestFlight,
> stores). N'utilisez Expo Go qu'avec des données de test.

Dès qu'il y a du réseau, les données sont aussi sauvegardées sur Supabase et partagées
entre les téléphones du même compte (voir `docs/SYNCHRO.md`).

## Finitions (accessibilité, mode sombre, compte)

Voir [`docs/FINITIONS.md`](docs/FINITIONS.md) : mode sombre automatique, contrastes vérifiés,
export des données, suppression du compte, page confidentialité, tests de bout en bout.

## Gratuit avec publicité, Premium sans publicité

Voir [`docs/MONETISATION.md`](docs/MONETISATION.md) : quand une pub peut apparaître (jamais
pendant un rappel, au plus une plein écran par jour), mise en service AdMob et RevenueCat,
Premium offert aux clients B2B.

## Publier sur les stores

Voir [`docs/PUBLICATION.md`](docs/PUBLICATION.md) (pas à pas) et
[`docs/STORES.md`](docs/STORES.md) (réponses aux questionnaires Apple et Google).

| Commande                | À quoi ça sert                                                       |
| ----------------------- | -------------------------------------------------------------------- |
| `npm run website:build` | Génère le site public dans `website/dist` (à envoyer sur Hostinger). |
| `npm run icons`         | Regénère les icônes de l'app et des stores.                          |

## Secrets

Aucun secret dans l'app. Voir les 3 catégories dans [`.env.example`](.env.example).
