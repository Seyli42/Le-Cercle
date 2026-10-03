# Fiches et déclarations des stores

Textes de présentation : [`store/listing.fr.json`](../store/listing.fr.json), vérifiés par
`__tests__/storeListing.test.ts` (longueurs maximales, aucune promesse médicale).
Visuels : `store/icon-512.png`, `store/feature-graphic.png` (regénérés par `npm run icons`).

> Ces réponses décrivent l'app **telle qu'elle est codée**. Si vous ajoutez un service
> (analytics, autre régie…), mettez à jour ce fichier, `app.config.ts` (privacyManifests)
> et `docs/PRIVACY.md` **ensemble**.

## Adresses à fournir (les deux stores)

| Champ                        | Valeur                                              |
| ---------------------------- | --------------------------------------------------- |
| Politique de confidentialité | `https://<votre site>/confidentialite.html`         |
| Assistance / support         | `https://<votre site>/support.html`                 |
| Suppression de compte (Play) | `https://<votre site>/suppression-compte.html`      |
| app-ads.txt (AdMob)          | `https://<votre site>/app-ads.txt` (racine du site) |

Le site déclaré comme « site du développeur » dans les stores doit être celui qui héberge
`app-ads.txt`.

## App Store Connect (Apple)

### Informations générales

| Champ                  | Réponse                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Catégorie principale   | Médecine (Medical) ; secondaire : Forme et santé                                                                       |
| Appareils              | iPhone uniquement (`supportsTablet: false`)                                                                            |
| Classification par âge | Répondez au questionnaire : « Informations médicales ou de traitement » = **Oui, peu fréquent** ; tout le reste = Non. |
| Achats intégrés        | Oui : abonnements Premium (voir `docs/MONETISATION.md`)                                                                |
| Chiffrement (export)   | Déjà déclaré dans l'app (`usesNonExemptEncryption: false`) : chiffrement standard uniquement.                          |
| Connexion requise      | Oui → compte de démonstration ci-dessous                                                                               |

### Confidentialité de l'app (« App Privacy »)

Suivi (« tracking ») : **Non** (pas d'IDFA, pas de fenêtre ATT, pubs non personnalisées).

| Type de donnée               | Utilisation              | Liée à l'identité | Pourquoi                         |
| ---------------------------- | ------------------------ | ----------------- | -------------------------------- |
| Santé                        | Fonctionnalités de l'app | Oui               | Médicaments, horaires, prises    |
| Adresse e-mail               | Fonctionnalités de l'app | Oui               | Connexion                        |
| Identifiant utilisateur      | Fonctionnalités de l'app | Oui               | Compte (aussi sur les plantages) |
| Contacts                     | Fonctionnalités de l'app | Oui               | Prénoms et numéros du Cercle     |
| Historique d'achat           | Fonctionnalités de l'app | Oui               | Abonnement Premium               |
| Données de plantage          | Fonctionnalités de l'app | Oui               | Sentry                           |
| Données de performance       | Fonctionnalités de l'app | Oui               | Sentry                           |
| Identifiant de l'appareil    | Publicité tierce         | Non               | AdMob (version gratuite)         |
| Interactions avec le produit | Publicité tierce         | Non               | AdMob                            |
| Données publicitaires        | Publicité tierce         | Non               | AdMob                            |
| Localisation approximative   | Publicité tierce         | Non               | AdMob (déduite de l'adresse IP)  |

Ce tableau correspond exactement au `privacyManifests` de `app.config.ts`.

### Abonnements (à créer avant la première soumission)

- Groupe « Premium », produits `premium_monthly` et `premium_yearly` (prix : voir
  `docs/MONETISATION.md` §6), nom affiché « Le Cercle Premium », description « Aucune
  publicité ».
- Pour chaque produit : **capture d'écran de l'écran Premium** (Mon compte → Le Cercle
  Premium) et texte de revue : « Supprime les publicités. Toutes les fonctions restent
  gratuites. »
- Le premier abonnement doit être **soumis avec une version de l'app**.

### Notes pour le vérificateur (à coller dans « App Review Information »)

```
Compte de démonstration : saisissez l'adresse ci-dessous, un champ mot de passe apparaît.
E-mail : <EXPO_PUBLIC_REVIEW_EMAIL>
Mot de passe : <mot de passe du compte de démo>
(Les autres utilisateurs se connectent avec un code reçu par e-mail.)

Le Cercle rappelle à l'utilisateur les médicaments qu'il a lui-même saisis. Ce n'est pas
un dispositif médical : aucun conseil, aucune dose suggérée, aucune vérification
d'interaction.

Notifications « Time Sensitive » : un rappel de médicament doit traverser le mode
Concentration (prise d'un traitement à heure fixe).

« Mon Cercle » : les proches ajoutés reçoivent un SMS de demande d'accord ; aucun SMS
d'alerte n'est envoyé sans leur réponse « OUI ».

Version gratuite : quelques publicités non personnalisées (Google AdMob), jamais pendant
un rappel, aucune donnée de santé transmise ; pas de suivi publicitaire, donc pas de
demande ATT. L'abonnement Premium supprime toutes les publicités.

Suppression du compte : Compte → Supprimer mon compte.
```

## Google Play Console

### Contenu de l'application (déclarations)

| Déclaration                                        | Réponse                                                                                                                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Règles de confidentialité                          | URL `confidentialite.html`                                                                                                                                                         |
| Annonces                                           | **Oui, l'application contient des annonces**                                                                                                                                       |
| Accès à l'application                              | Accès limité → instructions + compte de démonstration (mêmes infos que pour Apple)                                                                                                 |
| Classification du contenu (IARC)                   | Catégorie « Référence, actualités ou éducation » / utilitaire ; pas de violence, etc. Indiquez : contient des annonces, informations médicales (rappels saisis par l'utilisateur). |
| Public cible                                       | **18 ans et plus** (évite les règles « Familles », inadaptées à une app de santé)                                                                                                  |
| Applications de santé                              | Cochez **Gestion des médicaments et des traitements** (« Medication and treatment management ») ; l'app n'est pas un dispositif médical.                                           |
| Identifiant publicitaire                           | **Oui**, utilisé pour la publicité (SDK AdMob) et la prévention des fraudes                                                                                                        |
| Applis gouvernementales / financières / actualités | Non                                                                                                                                                                                |
| Suppression de compte                              | Oui, depuis l'app + URL `suppression-compte.html`                                                                                                                                  |

Permission sensible : `SCHEDULE_EXACT_ALARM` (alarmes exactes accordées par l'utilisateur,
pas `USE_EXACT_ALARM`) : aucune déclaration spéciale n'est demandée pour elle. Si la console
vous interroge sur un « service de premier plan », il provient de la bibliothèque système
de tâches de fond (WorkManager), pas d'une fonction de l'app : répondez selon le formulaire
affiché à ce moment, et gardez une trace de la réponse ici.

### Sécurité des données (« Data safety »)

- Données **chiffrées en transit** : Oui. Suppression **sur demande** : Oui.
- Les prestataires (Supabase, Twilio, Sentry, RevenueCat) agissent pour notre
  compte : ce n'est pas du « partage » au sens de Google. **AdMob**, lui, est déclaré comme
  partage pour la publicité.

| Catégorie Google               | Type                    | Collecté | Partagé | Finalités                          | Facultatif    |
| ------------------------------ | ----------------------- | -------- | ------- | ---------------------------------- | ------------- |
| Santé et remise en forme       | Informations de santé   | Oui      | Non     | Fonctionnalités de l'app           | Non           |
| Informations personnelles      | Adresse e-mail          | Oui      | Non     | Gestion du compte                  | Non           |
| Informations personnelles      | ID utilisateur          | Oui      | Non     | Gestion du compte, fonctionnalités | Non           |
| Contacts                       | Contacts (le Cercle)    | Oui      | Non     | Fonctionnalités de l'app           | Oui           |
| Informations financières       | Historique des achats   | Oui      | Non     | Fonctionnalités de l'app           | Oui           |
| Activité dans l'application    | Interactions avec l'app | Oui      | Oui     | Publicité ou marketing             | Oui (Premium) |
| Position                       | Position approximative  | Oui      | Oui     | Publicité ou marketing             | Oui (Premium) |
| Appareil ou autres ID          | Appareil ou autres ID   | Oui      | Oui     | Publicité, prévention des fraudes  | Oui (Premium) |
| Infos et performances de l'app | Journaux de plantage    | Oui      | Non     | Analyse (fiabilité)                | Non           |
| Infos et performances de l'app | Diagnostics             | Oui      | Non     | Analyse (fiabilité)                | Non           |

## Captures d'écran

| Store       | Format demandé                                                                                | Nombre |
| ----------- | --------------------------------------------------------------------------------------------- | ------ |
| App Store   | iPhone 6,9 pouces : 1320 × 2868 (ou 1290 × 2796)                                              | 3 à 10 |
| Google Play | Téléphone : 1080 × 1920 minimum conseillé ; + visuel `store/feature-graphic.png` (1024 × 500) | 2 à 8  |

Avec le **compte de démonstration** (jamais de vraies données de santé) et **sans pub
visible**, dans cet ordre :

1. Accueil « Aujourd'hui » avec 2 ou 3 prises (une « ✓ Pris »).
2. La notification de rappel avec ses boutons (écran verrouillé).
3. Mon Cercle avec un proche « ✓ A accepté ».
4. Le formulaire « Nouveau médicament » rempli.
5. L'historique des 7 derniers jours.
6. « Vérifier mes rappels » tout au vert.

Astuce : simulateur iOS (`npx eas-cli@latest build --profile development --platform ios`
avec un simulateur) ou un téléphone Android, captures natives, sans retouche trompeuse.
