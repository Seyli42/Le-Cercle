# Langues de DoseCircle

L'app existe en **11 langues** : français (langue de référence), anglais, espagnol,
portugais (du Portugal), chinois mandarin (simplifié), japonais, russe, arabe (écrit de
droite à gauche), hindi, indonésien et malais (deux fichiers distincts : les mots du
quotidien diffèrent, « ponsel » / « telefon », « notifikasi » / « pemberitahuan »).

La langue suit **celle du téléphone**, sans réglage dans l'app. Langue non prise en charge
(allemand, italien…) : anglais.

## Où sont les textes

| Quoi                                     | Fichier                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| Écrans, notifications, messages d'erreur | `src/i18n/locales/<langue>.json` (référence : `fr.json`)   |
| Alerte envoyée aux proches               | `supabase/functions/_shared/push.ts` (`ALERT_WORDS`)       |
| E-mail du code de connexion + sujet      | `supabase/templates/code.html`, `supabase/config.toml`     |
| Fiches App Store / Google Play           | `store/listing.<langue>.json`                              |
| Site web (confidentialité, suppression…) | français à la racine, anglais dans `en/` (`website/pages`) |

Chaque proche reçoit l'alerte **dans la langue de son propre téléphone** (enregistrée avec
son jeton de notification). L'e-mail du code suit la langue de l'app au moment de la
connexion ; pour les comptes plus anciens, il reste en français.

## Les contrôles automatiques

`npm test` vérifie, pour chaque langue : aucun texte manquant ou vide, les mêmes
`{variables}` qu'en français, les formes du pluriel exigées par la grammaire (russe : 3
formes, arabe : 6), la longueur des fiches des stores, et que l'e-mail contient bien le
code. `npm run test:functions` vérifie l'alerte dans les 11 langues.

## Ajouter ou modifier un texte

1. Ajoutez la clé dans `fr.json`, puis **dans les 10 autres fichiers** (le test liste ce
   qui manque).
2. `npx tsc --noEmit` : une clé mal écrite dans le code est refusée.
3. `npx jest __tests__/i18n.test.ts`.

## ⚠️ À faire relire avant la publication

Les traductions ont été rédigées avec soin mais **pas par des locuteurs natifs**. Faites
relire au minimum, par une personne native (ou un traducteur professionnel, ~0,08 €/mot) :

- les textes **juridiques et médicaux** : `privacyScreen`, `disclaimer`, `premium.legal`,
  `account.deleteBody`, `signIn.consent`, et `docs/PRIVACY.en.md` ;
- les **fiches des stores** (ce sont elles qui font vendre).

Le portugais est celui du Portugal ; pour le Brésil (le plus gros marché), une variante
`pt-BR` peut être ajoutée plus tard. L'arabe utilise le masculin par défaut dans l'alerte
(« لم يؤكّد ») ; une version neutre peut être demandée au relecteur.

## Fiches des stores dans chaque langue

- **App Store Connect** → votre app → **Informations sur l'app** → menu de langue en haut
  à droite → ajoutez : English (U.S.), Spanish (Spain), Portuguese (Portugal), Chinese
  (Simplified), Japanese, Russian, Arabic, Hindi, Indonesian, Malay. Pour chacune, collez
  `store/listing.<langue>.json` (nom, sous-titre, mots-clés, description…).
- **Play Console** → **Présence sur le Play Store → Fiche principale → Gérer les
  traductions → Ajouter vos propres traductions** : mêmes langues (en-US, es-ES, pt-PT,
  zh-CN, ja-JP, ru-RU, ar, hi-IN, id, ms).
- URL de confidentialité pour les autres langues : `https://<votre site>/en/privacy.html`.
