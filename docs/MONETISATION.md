# Monétisation : gratuit avec publicité, Premium sans publicité

## En clair

| Version  | Ce qu'on a                                                    | Prix                          |
| -------- | ------------------------------------------------------------- | ----------------------------- |
| Gratuite | **Tout** (rappels, historique, Cercle, scan) + un peu de pub. | 0 €                           |
| Premium  | La même chose, **sans aucune publicité**.                     | Abonnement (prix à fixer, §6) |

Règle d'or : on ne fait **jamais** payer la fiabilité. Un rappel de médicament n'est
jamais réservé au Premium, et une pub ne se place jamais entre la personne et son
traitement.

## 1. Quand une pub peut apparaître (et quand jamais)

Les règles sont dans `src/features/monetization/adPolicy.ts`, testées dans
`__tests__/adPolicy.test.ts` et `__tests__/appFlow.test.tsx`.

| Pub             | Où / quand                                                                           | Limite                  |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| Petite bannière | En bas de l'**Historique** uniquement, marquée « Publicité » + lien « Retirer ».     | —                       |
| Pub plein écran | Juste **après** avoir enregistré un nouveau médicament, ou en quittant l'Historique. | **1 par 24 h maximum.** |

**Jamais de pub :**

- pendant les **3 premiers jours** après l'installation (le temps de faire confiance) ;
- sur l'accueil (prises du jour, boutons « Pris »), les formulaires, le scan, le Cercle,
  le compte, la connexion, l'accueil du premier lancement ;
- si l'app a été ouverte **depuis un rappel** (la personne vient confirmer une prise) ;
- si une prise est **à faire maintenant**, reportée, en retard de moins de 2 h, ou prévue
  dans les **30 minutes** ;
- pour une personne **Premium**, et même tant qu'on n'est **pas sûr** qu'elle ne l'est pas
  (hors ligne, store injoignable). Un client payant ne doit jamais voir une pub ;
- sans le **consentement** RGPD (formulaire Google au premier lancement).

Les constantes (`AD_FREE_DAYS`, `INTERSTITIAL_MIN_GAP_MS`, `DOSE_QUIET_MS`) se changent en une
ligne si vous voulez plus ou moins de pub. Mesurez l'effet sur les désinstallations avant
d'augmenter.

## 2. Confidentialité (app de santé = prudence)

- **Pubs non personnalisées uniquement** (`requestNonPersonalizedAdsOnly`) : pas de profil
  publicitaire, donc **pas de fenêtre « Autoriser le suivi »** sur iPhone (pas d'ATT).
- **Aucune donnée de santé** n'est transmise à Google : ni mot-clé, ni nom de médicament, ni
  contenu de l'écran. Obligatoire chez Apple (règle 5.1.3) et sur Google Play.
- Annonces « tout public » uniquement (classification G).
- Le SDK publicitaire **ne démarre même pas** pour un Premium.
- « Mon compte » → **Choix publicitaires** : la personne peut changer d'avis à tout moment.

Revenu moindre qu'avec des pubs ciblées (souvent 30 à 50 % de moins), mais c'est le bon
compromis pour une app de santé : moins de risque CNIL, d'avis négatifs et de refus en revue.

## 3. Mettre en service AdMob (la pub)

| Étape                                                                                                                                                             | Pourquoi                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Créer un compte sur admob.google.com                                                                                                                              | La régie publicitaire de Google.                                                                                                         |
| Ajouter **2 applications** (iOS et Android) « Le Cercle »                                                                                                         | Chacune reçoit un ID d'application `ca-app-pub-…~…`.                                                                                     |
| Dans chaque app, créer **2 blocs d'annonces** : Bannière, Interstitiel                                                                                            | Chacun a un ID `ca-app-pub-…/…` (avec une barre `/`).                                                                                    |
| **Confidentialité et messages** → créer le message « Réglementations européennes »                                                                                | C'est le formulaire de consentement RGPD affiché par l'app.                                                                              |
| **Commandes de blocage** → Catégories sensibles : bloquer _Médicaments et compléments_, _Santé_, _Rencontres_, _Jeux d'argent_, _Alcool_, _Politique_, _Religion_ | Pas de pub pour un médicament dans une app de rappels (et la loi française interdit la pub grand public des médicaments sur ordonnance). |
| Publier `website/app-ads.txt` sur votre site (remplacer `pub-XXXX`)                                                                                               | Exigé par AdMob pour être payé normalement.                                                                                              |

Puis renseignez les variables (voir `.env.example`) dans EAS (expo.dev → projet →
Environment variables, environnement _production_) :

| Variable                                          | Valeur                         |
| ------------------------------------------------- | ------------------------------ |
| `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID`        | Les ID d'**application** (`~`) |
| `EXPO_PUBLIC_ADMOB_BANNER_IOS` / `_ANDROID`       | Les blocs Bannière (`/`)       |
| `EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS` / `_ANDROID` | Les blocs Interstitiel (`/`)   |

Hors production, l'app affiche **toujours les pubs de test de Google** : ne cliquez jamais
sur vos propres vraies pubs (AdMob suspend les comptes pour ça).

## 4. Mettre en service le Premium (RevenueCat)

RevenueCat vérifie les paiements auprès d'Apple et Google, gère renouvellements,
remboursements et restaurations. Gratuit jusqu'à 2 500 $ de revenus mensuels, puis 1 %.
Le faire soi-même demanderait deux intégrations serveur (App Store Server API et Google
Play Developer API) à maintenir : pas rentable à ce stade.

| Étape                                                                                                            | Pourquoi                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| App Store Connect → l'app → **Abonnements** : groupe « Premium », produits `premium_monthly` et `premium_yearly` | Les produits vendus par Apple.                                                            |
| Google Play Console → **Monétiser → Abonnements** : mêmes identifiants                                           | Les produits vendus par Google.                                                           |
| Créer un compte sur revenuecat.com, un projet, puis une app iOS et une app Android                               | Relie les deux stores.                                                                    |
| Créer l'**entitlement** `premium` et y attacher les produits                                                     | Le code vérifie exactement ce nom.                                                        |
| Créer l'**offering** « default » (courante) avec les packages Mensuel et Annuel                                  | L'écran Premium affiche ces offres.                                                       |
| Copier les **clés publiques** (`appl_…`, `goog_…`) dans `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`        | L'app parle à RevenueCat.                                                                 |
| `npx supabase secrets set REVENUECAT_SECRET_API_KEY=sk_…`                                                        | Efface l'historique d'achat à la suppression d'un compte (RGPD). Côté serveur uniquement. |

Le compte RevenueCat = l'identifiant Supabase : un Premium acheté sur l'iPhone fonctionne
aussi sur la tablette Android du même compte.

**Tester sans payer** : comptes « Sandbox » (App Store Connect → Utilisateurs → Sandbox) et
« testeurs de licence » (Play Console → Paramètres). Les achats y sont gratuits.

## 5. Premium offert (B2B, partenaires)

Pour vendre Le Cercle à une pharmacie, une mutuelle ou un EHPAD **sans pub pour leurs
patients**, sans achat dans l'app :

```sql
-- Supabase → SQL Editor (l'app ne peut ni écrire ni modifier ces lignes).
insert into public.premium_grants (user_id, ends_at, reason)
select id, '2027-12-31', 'Pharmacie du Centre — contrat 2027'
from auth.users where email in ('patient1@exemple.fr', 'patient2@exemple.fr');
```

L'écran Premium affiche « Offert par : Pharmacie du Centre, jusqu'au 31 décembre 2027 ».

## 6. Prix et revenus : ordres de grandeur (à valider avec vos chiffres)

Prix conseillés (France) : **1,99 €/mois** ou **14,99 €/an** (affiché « 2 mois offerts »).
Apple et Google prélèvent **15 %** (programme petites entreprises, à demander).

Hypothèses prudentes pour **1 000 utilisateurs actifs** (non garanties : le marché varie) :

| Source          | Hypothèse                                                           | ≈ par mois |
| --------------- | ------------------------------------------------------------------- | ---------- |
| Pub plein écran | ~0,5 affichage/jour/personne × 1 à 3 € les 1 000 (non personnalisé) | 15 à 45 €  |
| Bannière        | ~2 affichages/jour × 0,1 à 0,3 € les 1 000                          | 6 à 18 €   |
| Premium         | 2 à 4 % d'abonnés × ~1,50 € net                                     | 30 à 60 €  |

Conclusion honnête : la pub couvre les frais techniques (SMS, IA, serveurs) quand l'app
grandit, mais **le vrai levier, c'est le B2B** (licence annuelle par établissement, §5).
Suivez les chiffres réels dans AdMob et RevenueCat dès le premier mois.

## 7. Vérifier avant publication

1. Build de développement → l'app affiche le formulaire de consentement (simulez l'Europe
   si besoin), puis des pubs **de test**.
2. Les 3 premiers jours : aucune pub (changez l'heure du téléphone pour tester).
3. Ouvrez l'app en touchant un rappel, puis enregistrez un médicament : aucune pub.
4. Achat Sandbox → plus aucune pub, « ✓ Vous êtes Premium ». Désinstallez/réinstallez →
   « Restaurer mes achats » fonctionne.
5. Mode avion → aucune pub, l'app fonctionne normalement.

## Code

| Fichier                                         | Rôle                                                    |
| ----------------------------------------------- | ------------------------------------------------------- |
| `src/features/monetization/adPolicy.ts`         | Les règles « quand » (pures, testées).                  |
| `src/features/monetization/ads.ts`              | AdMob : consentement, démarrage, pub plein écran.       |
| `src/features/monetization/AdsProvider.tsx`     | Applique les règles aux deux moments prévus.            |
| `src/features/monetization/AdBanner.tsx`        | La bannière de l'historique.                            |
| `src/features/monetization/purchases.ts`        | RevenueCat : offres, achat, restauration.               |
| `src/features/monetization/PremiumProvider.tsx` | Premium = abonnement store **ou** accès offert.         |
| `src/app/(app)/premium.tsx`                     | Écran d'abonnement (prix, restaurer, mentions légales). |
| `supabase/migrations/…_premium_grants.sql`      | Premium offert (B2B), lecture seule pour l'app.         |
