# Politique de confidentialité — DoseCircle (modèle à compléter)

> Modèle rédigé pour l'application telle que développée. **À faire relire par un juriste**
> et compléter les champs entre crochets avant publication (site web + fiches des stores).

**Responsable de traitement :** [Raison sociale], [adresse], [SIRET], contact :
[e-mail dédié, ex. confidentialite@dosecircle.app]. DPO : [nom ou « non désigné »].

## 1. Données traitées

| Catégorie                      | Données                                                                                                          | Origine          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| Compte                         | Adresse e-mail, date de consentement                                                                             | Vous             |
| Données de santé (art. 9 RGPD) | Médicaments, quantités, horaires, dates de traitement, notes, réponses aux rappels (pris / passé / non confirmé) | Vous             |
| Profil                         | Prénom, fuseau horaire, délai d'alerte, dernière connexion                                                       | Vous / l'app     |
| Proches (« Mon Cercle »)       | Lien entre votre compte et celui de vos proches, leur prénom, codes d'invitation, journal des alertes            | Vous / le proche |
| Appareils                      | Jeton de notification de vos téléphones (pour recevoir les alertes du Cercle)                                    | L'app            |
| Technique                      | Rapports de plantage (sans données de santé ni identité)                                                         | L'app            |
| Publicité (version gratuite)   | Identifiant publicitaire de l'appareil, adresse IP (localisation approximative), interactions avec les annonces  | SDK Google AdMob |
| Abonnement Premium             | Historique d'achat (produit, dates, store), identifiant de compte                                                | App Store / Play |

## 2. Finalités et bases légales

- Rappels de prise, sauvegarde et synchronisation : exécution du service + **consentement
  explicite** au traitement des données de santé (case cochée à l'inscription).
- Alertes aux proches : consentement de l'utilisateur (invitation) **et** du proche (saisie du code).
- Rapports de plantage : intérêt légitime (fiabilité du service).
- Publicité de la version gratuite : **consentement** recueilli par le formulaire Google
  (UMP / TCF) au premier lancement, modifiable à tout moment (« Mon compte » →
  « Choix publicitaires »). Annonces **non personnalisées uniquement** ; aucune donnée de
  santé, aucun mot-clé, aucun contenu de l'app n'est transmis à la régie.
- Abonnement Premium : exécution du contrat.

Aucune revente de données, aucun profilage, aucune décision automatisée.

## 3. Destinataires / sous-traitants

| Sous-traitant       | Rôle                                                                   | Localisation                        | Garanties                                                       |
| ------------------- | ---------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| Supabase            | Base de données, authentification, fonctions serveur                   | Union européenne ([région choisie]) | DPA Supabase                                                    |
| Expo, Apple, Google | Acheminement des notifications d'alerte aux proches                    | États-Unis / UE                     | Conditions des services ; contenu limité au prénom et à l'heure |
| Sentry              | Rapports de plantage (sans données de santé)                           | [UE ou US selon l'offre]            | DPA                                                             |
| Google (AdMob)      | Publicités de la version gratuite (non personnalisées)                 | Monde (Google)                      | Conditions Google « responsable conjoint » / TCF                |
| RevenueCat          | Validation et suivi des abonnements Premium                            | États-Unis                          | DPA + clauses contractuelles types                              |
| Apple / Google      | Distribution de l'app, paiement des abonnements, notifications locales | —                                   | —                                                               |

> Pour un usage par des établissements de santé : prévoir un hébergeur certifié **HDS**.

## 4. Durées de conservation

- Données du compte et de santé : jusqu'à la suppression du compte.
- Journal des alertes et liens du Cercle : jusqu'à la suppression du compte ou le départ du proche.
- Historique d'achat : supprimé chez RevenueCat à la suppression du compte (les stores
  conservent leurs propres factures selon leurs obligations légales).
- Suppression du compte : effacement immédiat et définitif (base de données en cascade et
  téléphone). Les sauvegardes techniques de l'hébergeur expirent sous [7] jours.

## 5. Sécurité

Chiffrement des données sur le téléphone (SQLCipher, clé dans le Keychain / Keystore),
chiffrement en transit (HTTPS), cloisonnement strict par compte (Row Level Security, testé
automatiquement), aucune clé secrète dans l'application, sauvegarde Android désactivée.

## 6. Vos droits

Accès, rectification, effacement, portabilité (export JSON depuis « Mon compte »),
limitation, opposition, retrait du consentement à tout moment. Contact : [e-mail].
Réclamation : CNIL, www.cnil.fr.

## 7. Proches

Un proche n'est alerté que s'il a lui-même saisi, dans sa propre application, le code
d'invitation reçu de l'utilisateur. Chacun peut mettre fin au lien à tout moment (« Retirer »
ou « Ne plus veiller »). L'alerte ne contient que le prénom de l'utilisateur et l'heure de la
prise prévue, jamais le nom d'un médicament. Le lien est effacé si l'un des deux supprime son
compte.

_Dernière mise à jour : [date]._
