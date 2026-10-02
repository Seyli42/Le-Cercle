import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/useAuth';
import { isValidEmail, normalizeEmail } from '@/features/auth/validation';
import { toAppError } from '@/lib/errors';
import { colors, fontSize } from '@/theme';

export default function SignInScreen() {
  const { requestCode } = useAuth();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!isValidEmail(email)) {
      setError('Saisissez une adresse e-mail valide, par exemple marie@exemple.fr.');
      return;
    }
    if (!consent) {
      setError('Merci d’accepter le traitement de vos données de santé pour continuer.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await requestCode(email);
      router.push({ pathname: '/verify', params: { email: normalizeEmail(email) } });
    } catch (e) {
      setError(toAppError(e).userMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Bienvenue sur Le Cercle</Text>
      <Text style={styles.body}>
        Saisissez votre adresse e-mail : nous vous envoyons un code à 6 chiffres. Pas de mot de
        passe à retenir.
      </Text>
      <TextField
        label="Adresse e-mail"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
        }}
        placeholder="marie@exemple.fr"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
        error={error}
      />
      <Checkbox
        checked={consent}
        onChange={(value) => {
          setConsent(value);
          setError(null);
        }}
        label="J’accepte que Le Cercle conserve mes traitements et horaires de prise pour m’envoyer des rappels."
      />
      <PrimaryButton label="Recevoir mon code" loading={sending} onPress={() => void submit()} />
      <MedicalDisclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
});
