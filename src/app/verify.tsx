import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/features/auth/useAuth';
import {
  isValidEmail,
  isValidOtp,
  OTP_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  sanitizeOtp,
} from '@/features/auth/validation';
import { toAppError } from '@/lib/errors';
import { fontSize, makeStyles } from '@/theme';

export default function VerifyScreen() {
  const styles = useStyles();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const { verifyCode, requestCode } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const lastSubmitted = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Reached without an e-mail (e.g. deep link): go back to the first step.
  useEffect(() => {
    if (!isValidEmail(email)) router.replace('/sign-in');
  }, [email]);

  const submit = async (value: string) => {
    if (!isValidOtp(value)) {
      setError(`Le code contient ${OTP_LENGTH} chiffres.`);
      return;
    }
    if (verifying) return;
    lastSubmitted.current = value;
    setError(null);
    setVerifying(true);
    try {
      // On success the navigator switches to the signed-in screens by itself.
      await verifyCode(email, value);
    } catch (e) {
      setError(toAppError(e).userMessage);
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      await requestCode(email);
      setCode('');
      lastSubmitted.current = null;
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo('Un nouveau code vient de vous être envoyé.');
    } catch (e) {
      setError(toAppError(e).userMessage);
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.body}>
        Nous avons envoyé un code à <Text style={styles.strong}>{email}</Text>. Il est valable 10
        minutes. Pensez à regarder dans vos courriers indésirables.
      </Text>
      <TextField
        label="Code à 6 chiffres"
        value={code}
        onChangeText={(value) => {
          const clean = sanitizeOtp(value);
          setCode(clean);
          setError(null);
          // Submit automatically once complete, but never twice the same wrong code.
          if (isValidOtp(clean) && clean !== lastSubmitted.current) void submit(clean);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH + 2}
        autoFocus
        style={styles.code}
        error={error}
      />
      {info ? (
        <Text style={styles.info} accessibilityLiveRegion="polite">
          {info}
        </Text>
      ) : null}
      <PrimaryButton label="Valider" loading={verifying} onPress={() => void submit(code)} />
      <PrimaryButton
        label={cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
        variant="secondary"
        disabled={cooldown > 0}
        loading={resending}
        onPress={() => void resend()}
      />
      <PrimaryButton
        label="Changer d’adresse e-mail"
        variant="secondary"
        onPress={() => router.back()}
      />
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  body: { fontSize: fontSize.body, color: colors.text, lineHeight: 26 },
  strong: { fontWeight: '700' },
  info: { fontSize: fontSize.body, color: colors.primary },
  code: { fontSize: fontSize.code, letterSpacing: 8, textAlign: 'center' },
}));
