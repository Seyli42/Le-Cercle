# Le Cercle

Application iOS + Android de rappels de médicaments, avec alerte aux proches.
Une seule base de code : Expo / React Native / TypeScript.

- Cahier des charges et étapes : [`docs/CAHIER_DES_CHARGES.md`](docs/CAHIER_DES_CHARGES.md)
- Règles pour les agents IA : [`AGENTS.md`](AGENTS.md)

## Démarrer (première fois)

| Commande               | À quoi ça sert                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| `npm install`          | Télécharge toutes les bibliothèques dont l'app a besoin.               |
| `cp .env.example .env` | Crée votre fichier de configuration local (à remplir, jamais commité). |
| `npm start`            | Lance le serveur de développement et affiche un QR code.               |

Scannez le QR code avec l'app **Expo Go** (iPhone : appareil photo ; Android : app Expo Go).

## Vérifier la qualité

| Commande            | À quoi ça sert                                                   |
| ------------------- | ---------------------------------------------------------------- |
| `npm run typecheck` | Vérifie que les types TypeScript sont cohérents (aucune erreur). |
| `npm run lint`      | Repère le code risqué ou mal écrit.                              |
| `npm test`          | Lance les tests automatiques.                                    |
| `npm run check`     | Fait les trois ci-dessus + le formatage, en une fois.            |
| `npm run doctor`    | Vérifie que la configuration Expo est saine.                     |

## Structure

```
src/
  app/          Écrans (chaque fichier = une page, géré par Expo Router)
  components/   Éléments d'interface réutilisables
  config/       Configuration publique (variables EXPO_PUBLIC_*)
  lib/          Logique : erreurs, monitoring (Sentry)…
  theme/        Couleurs, tailles, espacements
__tests__/      Tests automatiques
docs/           Documentation projet
```

## Secrets

Aucun secret dans l'app. Voir les 3 catégories dans [`.env.example`](.env.example).
