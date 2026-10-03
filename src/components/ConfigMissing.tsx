import { Text } from 'react-native';

import { Screen } from '@/components/Screen';
import { fontSize, makeStyles } from '@/theme';

/** Development only: production builds refuse to start without this configuration. */
export function ConfigMissing() {
  const styles = useStyles();
  return (
    <Screen>
      <Text style={styles.title}>Configuration Supabase manquante</Text>
      <Text style={styles.body}>
        Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans le fichier
        .env, puis relancez « npm start -- --clear ».
      </Text>
      <Text style={styles.body}>Le guide pas à pas est dans docs/SUPABASE.md.</Text>
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
