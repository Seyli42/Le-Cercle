# Finitions (étape 8)

## En clair

| Fonction                     | Où                             | Ce que ça fait                                                                                                |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Accueil du premier lancement | `welcome` (avant la connexion) | Explique l'app en 3 points, une seule fois par téléphone.                                                     |
| « Pour bien démarrer »       | Accueil, tant qu'il est vide   | Ajouter un médicament, vérifier les rappels, inviter un proche.                                               |
| Mode sombre                  | Partout                        | Suit le réglage du téléphone. Couleurs dans `src/theme/index.ts`.                                             |
| Contrastes                   | `__tests__/themeContrast`      | Chaque couple texte/fond est testé (norme WCAG AA : 4,5:1 pour le texte, 3:1 pour les bordures).              |
| Exporter mes données         | Mon compte                     | Fichier JSON (médicaments, horaires, historique, Cercle) partagé par mail, Drive, Fichiers… (RGPD art. 20).   |
| Supprimer mon compte         | Mon compte                     | Taper `SUPPRIMER`, puis : serveur effacé, rappels annulés, données du téléphone effacées, retour à l'accueil. |
| Confidentialité              | Mon compte + écran d'accueil   | Résumé lisible ; la politique complète est à publier (modèle : `docs/PRIVACY.md`).                            |

## Suppression du compte : l'ordre compte

1. **Le serveur d'abord** (fonction `delete-account`) : supprime l'utilisateur ; toutes ses
   tables sont effacées en cascade (médicaments, prises, Cercle, journal IA). Testé :
   `supabase/tests/database/account_deletion.test.sql`.
2. **Puis le téléphone** : rappels annulés, base locale vidée, consentements effacés,
   déconnexion.

Sans réseau, rien n'est effacé et un message clair s'affiche (« Une connexion internet est
nécessaire… ») : on n'efface jamais le téléphone si le serveur garde encore les données.

## Accessibilité

- Boutons d'au moins 56 points de haut, texte principal en 18 points (16 pour les mentions secondaires).
- Chaque bouton, case et champ a un libellé lu par VoiceOver / TalkBack.
- Les erreurs sont annoncées (`accessibilityRole="alert"`), les titres sont des titres.
- Les tailles de texte du téléphone (texte agrandi) sont respectées.

À vérifier à la main, une fois : activez VoiceOver (iOS) ou TalkBack (Android) et faites
« ajouter un médicament » les yeux fermés.

## Tests de bout en bout

`__tests__/appFlow.test.tsx` démarre **la vraie app** (tous les écrans, la vraie navigation,
une vraie base SQLite). Seul l'extérieur est simulé (Supabase, notifications, coffre-fort).

| Scénario                | Vérifie                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| Premier lancement       | Accueil → e-mail + consentement → code → « Pour bien démarrer ».    |
| Ajout d'un médicament   | Enregistré sur le téléphone, affiché, rappels programmés.           |
| Suppression du compte   | Mot de confirmation exigé, serveur appelé, tout effacé, déconnecté. |
| Suppression hors réseau | Refusée avec un message clair, rien n'est effacé.                   |

| Commande                              | À quoi ça sert                             |
| ------------------------------------- | ------------------------------------------ |
| `npx jest __tests__/appFlow.test.tsx` | Lance seulement les tests de bout en bout. |
| `npm run check`                       | Lance tout (types, style, tous les tests). |

## Mise en service

| Commande                   | À quoi ça sert                               |
| -------------------------- | -------------------------------------------- |
| `npm run db:push`          | Envoie les migrations (rien de nouveau ici). |
| `npm run functions:deploy` | Met en ligne `delete-account`.               |

Puis une nouvelle version de l'app (nouveaux modules natifs : export de fichier, partage,
thème système) : `npx eas-cli@latest build --profile development --platform android`.
