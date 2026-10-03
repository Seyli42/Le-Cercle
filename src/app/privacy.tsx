import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { fontSize, makeStyles, spacing } from '@/theme';

/**
 * Plain-language summary of the privacy policy, readable before and after sign-in.
 * Full text: docs/PRIVACY.md (to publish on the website before going live).
 */
const SECTIONS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Ce que nous enregistrons',
    body: 'Votre adresse e-mail, vos médicaments et horaires tels que vous les saisissez, vos réponses aux rappels, votre prénom et, si vous en invitez, le lien avec les proches qui veillent sur vous (leur prénom uniquement).',
  },
  {
    title: 'Pourquoi',
    body: 'Uniquement pour vous rappeler vos prises, sauvegarder vos données, et prévenir les proches que vous avez choisis. Aucune revente, aucun profilage.',
  },
  {
    title: 'Publicité (version gratuite)',
    body: 'La version gratuite affiche quelques publicités (Google AdMob), uniquement non personnalisées et après votre accord. Vos données de santé ne sont jamais transmises aux régies : elles ne savent pas que vous prenez un traitement. Premium supprime toute publicité ; l’achat est géré par l’App Store ou Google Play, via RevenueCat.',
  },
  {
    title: 'Où sont vos données',
    body: 'Sur votre téléphone (base chiffrée) et sur nos serveurs en Europe (Supabase). Les alertes aux proches passent par le service de notifications d’Expo, d’Apple et de Google, les rapports de plantage par Sentry (sans aucune donnée de santé), les publicités par Google AdMob et l’abonnement par RevenueCat.',
  },
  {
    title: 'Combien de temps',
    body: 'Tant que votre compte existe. Quand vous le supprimez, toutes vos données sont effacées immédiatement de nos serveurs et de ce téléphone.',
  },
  {
    title: 'Vos droits',
    body: 'Depuis « Mon compte » : exporter toutes vos données, supprimer votre compte. Vous pouvez aussi nous écrire pour toute question, et saisir la CNIL (cnil.fr).',
  },
  {
    title: 'DoseCircle n’est pas un dispositif médical',
    body: 'L’application vous rappelle ce que vous avez saisi. Elle ne donne aucun conseil médical, ne vérifie ni les doses ni les interactions. En cas de doute, demandez à votre médecin ou pharmacien.',
  },
];

export default function PrivacyScreen() {
  const styles = useStyles();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Confidentialité' }} />
      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.title} accessibilityRole="header">
            {section.title}
          </Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { gap: spacing.xs },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
