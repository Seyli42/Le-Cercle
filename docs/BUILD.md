# Installer une vraie version de l'app sur votre téléphone

**Expo Go** suffit pour regarder les écrans, mais pas pour tester les rappels pour de vrai
(chiffrement, alarmes exactes, boutons en arrière-plan). Il faut une **version de
développement** : votre propre app « DoseCircle (Dev) », construite dans le cloud par Expo
(EAS). Pas besoin de Mac ni d'Android Studio.

## Une seule fois

| Commande                     | À quoi ça sert                                                     |
| ---------------------------- | ------------------------------------------------------------------ |
| Créer un compte sur expo.dev | Compte gratuit qui construit l'app dans le cloud.                  |
| `npx eas-cli@latest login`   | Connecte votre ordinateur à ce compte.                             |
| `npx eas-cli@latest init`    | Crée le projet sur expo.dev et ajoute son identifiant à la config. |

Puis déclarez les variables publiques pour l'environnement _development_ (expo.dev →
projet → **Environment variables**) : `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SENTRY_DSN` (facultatif en dev) et
`EXPO_PUBLIC_APP_ENV=development`.

## Android (le plus simple pour commencer)

| Commande                                                            | À quoi ça sert                           |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `npx eas-cli@latest build --profile development --platform android` | Construit l'app dans le cloud (~15 min). |

À la fin, un QR code s'affiche : scannez-le avec le téléphone Android, installez l'app
(autorisez « sources inconnues » si demandé). Ensuite `npm start` et ouvrez « DoseCircle (Dev) ».

## iPhone

Nécessite un **compte Apple Developer** (99 €/an), obligatoire de toute façon pour publier.

| Commande                                                        | À quoi ça sert                                        |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| `npx eas-cli@latest device:create`                              | Enregistre votre iPhone (lien à ouvrir sur l'iPhone). |
| `npx eas-cli@latest build --profile development --platform ios` | Construit l'app pour votre iPhone.                    |

EAS active automatiquement la capacité « Time Sensitive Notifications » de l'app.

## Ensuite

Suivez le protocole de test de [`docs/RAPPELS.md`](RAPPELS.md). Pour publier sur les
stores : [`docs/PUBLICATION.md`](PUBLICATION.md).
