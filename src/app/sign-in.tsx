import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { env } from '@/config/env';
import { useAuth } from '@/features/auth/useAuth';
import { isValidEmail, normalizeEmail } from '@/features/auth/validation';
import { toAppError } from '@/lib/errors';
import { fontSize, makeStyles } from '@/theme';
import { t } from '@/i18n';

export default function SignInScreen() {
  const styles = useStyles();
  const { requestCode, signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Store reviewers cannot read our e-mails: their demo address signs in with a password.
  const demo = env.reviewEmail !== null && normalizeEmail(email) === env.reviewEmail;

  const submit = async () => {
    if (!isValidEmail(email)) {
      setError(t('signIn.emailInvalid'));
      return;
    }
    if (!consent) {
      setError(t('signIn.consentRequired'));
      return;
    }
    setError(null);
    setSending(true);
    try {
      if (demo) {
        // On success the session opens and the app leaves this screen by itself.
        await signInWithPassword(email, password);
        return;
      }
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
      <Text style={styles.title}>{t('signIn.title')}</Text>
      <Text style={styles.body}>{t('signIn.intro')}</Text>
      <TextField
        label={t('signIn.email')}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          setError(null);
        }}
        placeholder={t('signIn.emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType={demo ? 'next' : 'send'}
        onSubmitEditing={() => void submit()}
        error={error}
      />
      {demo ? (
        <TextField
          label={t('signIn.demoPassword')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setError(null);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          onSubmitEditing={() => void submit()}
        />
      ) : null}
      <Checkbox
        checked={consent}
        onChange={(value) => {
          setConsent(value);
          setError(null);
        }}
        label={t('signIn.consent')}
      />
      <PrimaryButton
        label={demo ? t('signIn.signIn') : t('signIn.getCode')}
        loading={sending}
        onPress={() => void submit()}
      />
      <MedicalDisclaimer />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { fontSize: fontSize.title, fontWeight: '700', color: colors.text },
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
}));
