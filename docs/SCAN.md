# Scan d'ordonnance et de boîte (étape 7)

## En clair

1. « 📷 Scanner une ordonnance ou une boîte » → photo (ou photo existante).
2. La photo est réduite sur le téléphone (~300 Ko, sans données GPS), envoyée à la fonction
   serveur `extract-prescription`, qui la fait lire par **Claude Opus 5.5** (Anthropic).
3. L'app affiche chaque médicament lu. Pour chacun : **« Vérifier et ajouter »** ouvre le
   formulaire habituel, pré-rempli, avec un encadré qui liste tout ce qui a été proposé.
4. **Rien n'est enregistré sans le bouton « J'ai vérifié, enregistrer ».**

## Règles de sécurité médicale

| Règle                                                | Comment c'est garanti                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| L'IA recopie, elle ne conseille pas                  | Consigne système + réponse au format imposé (aucun champ « conseil »).                                                                                                               |
| Pas de dose ni d'horaire inventés                    | Champs vides si non écrits ; l'app exige que l'utilisateur les complète.                                                                                                             |
| Les conversions sont transparentes                   | « matin / midi / soir / coucher » → 08:00 / 12:00 / 19:00 / 22:00 et « pendant 7 jours » → date de fin : règles fixes de l'app (testées), chacune affichée « proposée, à vérifier ». |
| Le texte d'origine reste visible                     | Copié dans la note du médicament : « Sur le document : … ».                                                                                                                          |
| Lecture douteuse signalée                            | Mention « lecture incertaine » + avertissements de l'IA.                                                                                                                             |
| Texte piégé dans la photo (« ignore tes consignes ») | La consigne précise que le texte de l'image est une donnée, jamais une instruction ; la réponse est de toute façon nettoyée et relue par l'utilisateur.                              |
| Données personnelles                                 | Consigne : ne pas recopier nom du patient, du médecin, numéros. Aucun champ prévu pour.                                                                                              |

## Confidentialité

- Consentement explicite demandé au premier scan (mémorisé sur le téléphone).
- Les photos ne sont **jamais stockées** par Le Cercle (ni base, ni stockage, ni journaux).
  Seuls sont gardés : la date, le résultat (lu / illisible / refusé) et les compteurs de
  tokens (table `ai_extractions`, visible par l'utilisateur seul).
- Anthropic n'utilise pas les données de l'API pour entraîner ses modèles ; elles sont
  conservées au maximum 30 jours par Anthropic pour la sécurité. Pour un client B2B
  exigeant (hôpital, HDS), signez le DPA d'Anthropic et vérifiez les options de rétention.

## Coûts et limites

- 20 lectures par personne et par 24 h (modifiable dans `extract-prescription/index.ts`).
- Ordre de grandeur : une photo ≈ 1 500 à 2 000 tokens d'entrée + raisonnement et réponse
  ≈ 1 000 à 3 000 tokens de sortie, soit environ **2 à 7 centimes par lecture** avec Claude
  Opus 5.5 (4 $ / 20 $ par million de tokens). Les compteurs réels sont enregistrés dans
  `ai_extractions` : utilisez-les pour facturer ou plafonner par client B2B.
- Si Claude décline une requête (filtre de sécurité trop prudent), elle est relancée
  automatiquement sur le modèle de secours recommandé par Anthropic (`fallbacks: "default"`).

## Mise en service

| Commande                                          | À quoi ça sert                                   |
| ------------------------------------------------- | ------------------------------------------------ |
| Créer une clé sur console.anthropic.com           | Clé API (facturation à l'usage).                 |
| `npx supabase secrets set ANTHROPIC_API_KEY=sk-…` | Range la clé côté serveur (jamais dans l'app).   |
| `npm run db:push`                                 | Crée la table `ai_extractions` et ses fonctions. |
| `npm run functions:deploy`                        | Met en ligne `extract-prescription`.             |

Puis construisez une nouvelle version de l'app (appareil photo = module natif) :
`npx eas-cli@latest build --profile development --platform android`.

## Tester

1. Photographiez une vraie ordonnance (ou une boîte) bien éclairée.
2. Vérifiez : noms recopiés à l'identique, horaires « proposés » signalés, aucune dose
   absente du document n'apparaît.
3. Photographiez autre chose (un ticket de caisse) → « Ce document ne ressemble pas à une
   ordonnance ».
4. Mode avion → message clair « Connexion impossible », la saisie à la main reste possible.

## Code

| Fichier                                    | Rôle                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `supabase/functions/_shared/extraction.ts` | Consigne, schéma de réponse, nettoyage, appel Claude (testés). |
| `supabase/functions/extract-prescription/` | Fonction serveur : plafond, appel, journal d'usage.            |
| `supabase/migrations/…_ai_extractions.sql` | Journal d'usage et plafond quotidien.                          |
| `src/features/scan/mapExtraction.ts`       | Résultat IA → formulaire pré-rempli + propositions.            |
| `src/features/scan/api.ts`                 | Préparation de la photo, appel, messages d'erreur.             |
| `src/app/(app)/medications/scan.tsx`       | Écran : consentement, photo, vérification.                     |
