/**
 * Store texts follow the limits of App Store Connect / Google Play Console, and never
 * make a medical claim (Apple 1.4.1, Google Play health policy, French law). One listing
 * per app language (store/listing.<language>.json).
 */
import { LANGUAGES, translate, type Language } from '@/i18n';
import { SNOOZE_MINUTES } from '@/features/reminders/notifications';

type Listing = {
  appStore: {
    name: string;
    subtitle: string;
    keywords: string;
    promotionalText: string;
    description: string;
    whatsNew: string;
  };
  googlePlay: { title: string; shortDescription: string; fullDescription: string };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = (language: Language): Listing => require(`../store/listing.${language}.json`);

/** Play policy: no price or ranking claims in the title and short description. */
const PROMO_WORDS =
  /gratuit|free|gratis|grátis|免费|無料|бесплатн|مجاني|मुफ़्त|percuma|meilleur|best|mejor|n°\s?1|#\s?1|top|promo|\p{Extended_Pictographic}/iu;

/** Words that would claim a medical benefit (French and English, the reviewed ones). */
const MEDICAL_CLAIMS =
  /guéri|soigne|diagnostic|dose recommandée|efficacité|interaction détectée|cures?\b|diagnos|recommended dose|detects? interactions/i;

describe.each(LANGUAGES)('%s', (language) => {
  const { appStore, googlePlay } = load(language);
  const fullDescription =
    googlePlay.fullDescription === '@appStore.description'
      ? appStore.description
      : googlePlay.fullDescription;

  it('fits the App Store Connect limits', () => {
    expect(appStore.name.length).toBeLessThanOrEqual(30);
    expect(appStore.subtitle.length).toBeLessThanOrEqual(30);
    expect(appStore.keywords.length).toBeLessThanOrEqual(100);
    expect(appStore.promotionalText.length).toBeLessThanOrEqual(170);
    expect(appStore.description.length).toBeLessThanOrEqual(4000);
    expect(appStore.whatsNew.length).toBeGreaterThan(0);
  });

  it('keywords: comma-separated, no spaces around, no word already in the name', () => {
    const words = appStore.keywords.split(',');
    expect(words.every((w) => w === w.trim() && w.length > 0)).toBe(true);
    const name = appStore.name.toLowerCase();
    expect(words.filter((w) => name.includes(w.toLowerCase()))).toEqual([]);
    expect(new Set(words).size).toBe(words.length);
  });

  it('fits the Play Console limits, without promotional words or emoji', () => {
    expect(googlePlay.title.length).toBeLessThanOrEqual(30);
    expect(googlePlay.shortDescription.length).toBeLessThanOrEqual(80);
    expect(fullDescription.length).toBeLessThanOrEqual(4000);
    for (const text of [googlePlay.title, googlePlay.shortDescription]) {
      expect(text).not.toMatch(PROMO_WORDS);
    }
  });

  it('never claims a medical benefit', () => {
    for (const text of [
      appStore.description,
      appStore.promotionalText,
      googlePlay.shortDescription,
    ]) {
      expect(text).not.toMatch(MEDICAL_CLAIMS);
    }
  });

  it('says it is not a medical device, mentions the ads, and the real snooze button', () => {
    const notMedical = translate(language, 'privacyScreen.notMedical.title');
    // The French listing uses straight apostrophes.
    expect(appStore.description.replace(/'/g, '’')).toContain(notMedical);
    expect(appStore.description.toLowerCase()).toContain(
      translate(language, 'ads.label').toLowerCase().slice(0, 4),
    );
    expect(appStore.description).toContain(
      translate(language, 'notifications.actionSnooze', { minutes: SNOOZE_MINUTES }),
    );
  });
});
