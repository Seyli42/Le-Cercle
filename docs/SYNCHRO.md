# Synchronisation et historique (étape 5)

## En clair

Le téléphone est le **carnet principal** : tout s'y écrit immédiatement, même sans réseau.
Dès qu'il y a du réseau, DoseCircle **recopie** les changements sur le serveur (Supabase),
et récupère ceux faits sur un autre téléphone du même compte.

L'utilisateur voit toujours où en sont ses données :

| Message                                         | Signification                                         |
| ----------------------------------------------- | ----------------------------------------------------- |
| ✓ Sauvegardé en ligne le 3 octobre à 09:12      | Tout est aussi sur le serveur.                        |
| Hors ligne. 3 modifications en attente d'envoi… | Tout est sur le téléphone, envoi au retour du réseau. |
| Sauvegarde en ligne momentanément impossible    | Nouvel essai automatique (30 s, 2 min, 10 min).       |

## Quand la synchronisation a lieu

- à l'ouverture de l'app et à chaque retour au premier plan ;
- 3 secondes après une modification (plusieurs modifications rapprochées = un seul envoi) ;
- quand le réseau revient ;
- toutes les 10 minutes quand l'app est ouverte ;
- en tâche de fond (~toutes les 4 h), avant le renouvellement des rappels ;
- juste avant une déconnexion (si le réseau le permet).

## Conflits : « la dernière modification gagne »

Si le même médicament est modifié sur deux téléphones sans réseau, c'est la modification
**faite le plus tard (heure du téléphone)** qui est gardée, partout, quel que soit l'ordre
d'arrivée au serveur. Pour une prise de médicament, c'est la dernière réponse
(« Pris » / « Passer ») qui compte, et il n'y a jamais deux lignes pour la même prise.

> Limite : si l'heure d'un téléphone est fausse de plusieurs heures, ses modifications
> peuvent gagner ou perdre à tort. Les téléphones réglés en heure automatique (cas général)
> ne sont pas concernés.

## Sécurité

- Les fonctions serveur `sync_push` / `sync_pull` s'exécutent **avec les droits de
  l'utilisateur** : les règles RLS s'appliquent, impossible de lire ou d'écraser les
  données d'un autre compte (testé, y compris avec une date « dans le futur »).
- Le propriétaire d'une ligne vient toujours de la session, jamais des données envoyées.
- Un envoi est **tout ou rien** : jamais de médicament enregistré sans ses horaires.
- Une ligne refusée par le serveur est isolée (signalée à Sentry) et ne bloque pas les autres.
- Téléphone partagé : quand un autre compte se connecte, les données de l'ancien compte déjà
  sauvegardées en ligne sont effacées du téléphone ; ses modifications non envoyées sont
  gardées pour lui.

## Historique

Écran « Historique des prises » (30 jours) : chaque prise prévue, avec « ✓ Pris à 08:05 »,
« Passé » ou « Non confirmé », et des comptes factuels (« 12 prises confirmées sur 14 »).
Aucun score, aucune interprétation médicale.

## Code

| Fichier                                 | Rôle                                                       |
| --------------------------------------- | ---------------------------------------------------------- |
| `supabase/migrations/…_sync.sql`        | Colonnes `client_updated_at`, fonctions `sync_push/pull`.  |
| `supabase/tests/database/sync.test.sql` | 17 tests serveur (conflits, sécurité, lots).               |
| `src/features/sync/sync.ts`             | Envoi / réception / conflits (testé sur 2 « téléphones »). |
| `src/features/sync/scheduler.ts`        | Quand synchroniser, une seule à la fois, nouveaux essais.  |
| `src/features/sync/supabaseRemote.ts`   | Branchement sur Supabase.                                  |
| `src/features/history/history.ts`       | Historique et comptes.                                     |

## Mise en ligne

`npm run db:push` envoie la nouvelle migration sur votre projet Supabase (voir
`docs/SUPABASE.md`). À faire **avant** d'installer cette version de l'app.
