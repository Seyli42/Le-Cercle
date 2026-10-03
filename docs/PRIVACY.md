# Politique de confidentialité — Le Cercle (modèle à compléter)

> Modèle rédigé pour l'application telle que développée. **À faire relire par un juriste**
> et compléter les champs entre crochets avant publication (site web + fiches des stores).

**Responsable de traitement :** [Raison sociale], [adresse], [SIRET], contact :
[e-mail dédié, ex. confidentialite@lecercle.app]. DPO : [nom ou « non désigné »].

## 1. Données traitées

| Catégorie                      | Données                                                                                                          | Origine          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| Compte                         | Adresse e-mail, date de consentement                                                                             | Vous             |
| Données de santé (art. 9 RGPD) | Médicaments, quantités, horaires, dates de traitement, notes, réponses aux rappels (pris / passé / non confirmé) | Vous             |
| Profil                         | Prénom, fuseau horaire, délai d'alerte, dernière connexion                                                       | Vous / l'app     |
| Proches (« le Cercle »)        | Prénom et numéro de portable des proches, leur consentement, journal des SMS envoyés                             | Vous / le proche |
| Lecture d'ordonnance           | Photo transmise pour lecture (non conservée), compteurs d'usage                                                  | Vous             |
| Technique                      | Rapports de plantage (sans données de santé ni identité)                                                         | L'app            |

## 2. Finalités et bases légales

- Rappels de prise, sauvegarde et synchronisation : exécution du service + **consentement
  explicite** au traitement des données de santé (case cochée à l'inscription).
- Alertes aux proches : consentement de l'utilisateur **et** du proche (réponse « OUI »).
- Lecture d'ordonnance : consentement explicite au premier scan.
- Rapports de plantage : intérêt légitime (fiabilité du service).

Aucune publicité, aucune revente, aucun profilage, aucune décision automatisée.

## 3. Destinataires / sous-traitants

| Sous-traitant  | Rôle                                                 | Localisation                        | Garanties                                                                      |
| -------------- | ---------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| Supabase       | Base de données, authentification, fonctions serveur | Union européenne ([région choisie]) | DPA Supabase                                                                   |
| Twilio         | Envoi et réception des SMS                           | [à préciser]                        | DPA + clauses contractuelles types                                             |
| Anthropic      | Lecture des photos d'ordonnance                      | États-Unis                          | DPA + clauses contractuelles types ; données non utilisées pour l'entraînement |
| Sentry         | Rapports de plantage (sans données de santé)         | [UE ou US selon l'offre]            | DPA                                                                            |
| Apple / Google | Distribution de l'app, notifications locales         | —                                   | —                                                                              |

> Pour un usage par des établissements de santé : prévoir un hébergeur certifié **HDS**.

## 4. Durées de conservation

- Données du compte et de santé : jusqu'à la suppression du compte.
- Photos d'ordonnance : **non conservées** (traitement en mémoire uniquement).
- Journal des SMS et des lectures IA : jusqu'à la suppression du compte.
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

Un proche n'est jamais alerté sans avoir répondu « OUI ». Il peut se retirer à tout moment
en répondant « STOP ». Ses données sont effacées si l'utilisateur le retire ou supprime son
compte.

_Dernière mise à jour : [date]._
