# Le moteur de rappels (étape 4)

> Exigence n°1 du produit : **un rappel manqué = l'app a échoué.**

## Comment ça marche (en clair)

Imaginez un réveil mécanique que l'on remonte à l'avance : Le Cercle **programme les
rappels directement dans le téléphone**, pour les jours à venir. C'est le téléphone lui-même
qui sonne à l'heure, comme un réveil. Il n'a besoin ni d'internet, ni que l'app soit ouverte.

| Situation                                                     | Le rappel sonne ? | Pourquoi                                             |
| ------------------------------------------------------------- | ----------------- | ---------------------------------------------------- |
| Pas de réseau / mode avion                                    | ✅                | Tout est programmé sur le téléphone.                 |
| Téléphone verrouillé                                          | ✅                | Notification système, comme un réveil.               |
| App fermée (même balayée)                                     | ✅                | Le système affiche la notification sans l'app.       |
| Après redémarrage                                             | ✅                | Android : reprogrammation au démarrage. iOS : natif. |
| Mode Concentration / Ne pas déranger (iOS)                    | ✅                | Notifications « urgentes » (Time Sensitive).         |
| Changement d'heure été/hiver                                  | ✅                | Calcul en heure locale, testé automatiquement.       |
| Android sans « alarmes exactes »                              | ⚠️ en retard      | Détecté : bandeau rouge + bouton pour corriger.      |
| Android avec économie de batterie agressive (Xiaomi, Huawei…) | ⚠️                | Détecté : bandeau orange + bouton.                   |
| Notifications refusées                                        | ❌                | Détecté : bandeau rouge + bouton pour autoriser.     |

## Les choix techniques

- **Un rappel par prise** (et non un rappel « répétitif ») : si la personne a déjà pris
  son médicament (bouton « Pris » dans l'app), le rappel est **annulé**. Jamais de « Prenez
  votre médicament » pour une prise déjà faite → pas de risque de double dose.
- **Fenêtre glissante** : iOS limite à 64 rappels en attente par app. Le Cercle programme
  les 60 prochaines prises (200 sur Android, jusqu'à 30 jours) et **renouvelle la fenêtre** :
  - à chaque ouverture de l'app ;
  - après chaque modification d'un médicament ;
  - après chaque réponse à un rappel ;
  - toutes les ~4 h en tâche de fond (le système choisit le moment exact).
- **Filet de sécurité** : si la limite coupe la fenêtre, une dernière notification
  « Ouvrez Le Cercle » est programmée juste après le dernier rappel. La personne n'est
  jamais laissée sans rappel en silence.
- **Boutons dans la notification** : « ✓ Pris », « Dans 10 min », « Passer ».
  Android les traite sans ouvrir l'app ; iOS ouvre l'app (plus fiable sur iOS).
  Les réponses sont enregistrées localement (journal `dose_events`), synchronisées à l'étape 5.
- **Rien n'est jamais programmé deux fois** : chaque rappel a un identifiant calculé ; le
  moteur compare « ce qui est programmé » et « ce qui doit l'être » et n'applique que la
  différence, une opération à la fois.
- **Déconnexion** : tous les rappels de Le Cercle sont supprimés (avec confirmation).

## Code

| Fichier                                   | Rôle                                                         |
| ----------------------------------------- | ------------------------------------------------------------ |
| `src/features/reminders/planner.ts`       | Calcule les rappels à programmer (logique pure, testée).     |
| `src/features/reminders/engine.ts`        | Applique le plan sur le téléphone, traite les boutons.       |
| `src/features/reminders/notifications.ts` | Canal Android, boutons, autorisations.                       |
| `src/features/reminders/background.ts`    | Tâches de fond (boutons Android, renouvellement périodique). |
| `src/features/reminders/health.ts`        | Diagnostic « vos rappels vont-ils sonner ? ».                |
| `src/features/reminders/today.ts`         | Liste « Aujourd'hui » et statut de chaque prise.             |
| `modules/reminder-health/`                | Petit module Android natif : alarmes exactes, batterie.      |
| `src/app/(app)/reminders.tsx`             | Écran « Vérifier mes rappels ».                              |

## Protocole de test sur vrais téléphones (avant chaque version)

Les tests automatiques (`npm test`) couvrent les calculs. Ces vérifications-ci demandent un
vrai téléphone, avec une **version de développement** (pas Expo Go) :

1. Ajouter un médicament avec une prise dans 3 minutes. Verrouiller le téléphone → le rappel
   sonne et s'affiche sur l'écran verrouillé.
2. Mode avion activé, app fermée (balayée) → le rappel sonne quand même.
3. Appuyer sur **Dans 10 min** → nouveau rappel 10 minutes plus tard, marqué « reporté ».
4. Appuyer sur **✓ Pris** → l'écran « Aujourd'hui » affiche « ✓ Pris à … ».
5. Marquer une prise « Pris » 30 min avant l'heure depuis l'app → **aucun** rappel à l'heure.
6. Programmer une prise dans 5 minutes, **redémarrer le téléphone**, ne pas ouvrir l'app →
   le rappel sonne.
7. Android 14+ : réglages → Applications → Le Cercle → désactiver « Alarmes et rappels » →
   rouvrir l'app → bandeau rouge ; réactiver via le bouton → bandeau disparu.
8. iOS : activer un mode Concentration → le rappel passe quand même (« urgent »).
9. « Vérifier mes rappels » → « Envoyer un rappel test » → reçu en 10 secondes.

## Limites connues

- **Expo Go** ne permet pas de vérifier les alarmes exactes ni la batterie (module natif) :
  tester avec une version de développement (`docs/BUILD.md`).
- Si la personne **n'ouvre jamais l'app** pendant plus de ~10 jours _et_ que le système ne
  lance pas la tâche de fond (téléphone très restrictif), la fenêtre peut s'épuiser : c'est
  le rôle de la notification « Ouvrez Le Cercle ». Les alertes aux proches (étape 6) ajoutent
  un second filet de sécurité côté serveur.
- Changement de **fuseau horaire** : les rappels sont recalculés à la prochaine ouverture
  de l'app ou au prochain renouvellement en tâche de fond.
