/**
 * Store texts follow the limits of App Store Connect / Google Play Console, and never
 * make a medical claim (Apple 1.4.1, Google Play health policy, French law).
 */
import listing from '../store/listing.fr.json';

import { SNOOZE_MINUTES } from '@/features/reminders/notifications';

const { appStore, googlePlay } = listing;
const fullDescription =
  googlePlay.fullDescription === '@appStore.description'
    ? appStore.description
    : googlePlay.fullDescription;

describe('App Store', () => {
  it('fits the App Store Connect limits', () => {
    expect(appStore.name.length).toBeLessThanOrEqual(30);
    expect(appStore.subtitle.length).toBeLessThanOrEqual(30);
    expect(appStore.keywords.length).toBeLessThanOrEqual(100);
    expect(appStore.promotionalText.length).toBeLessThanOrEqual(170);
    expect(appStore.description.length).toBeLessThanOrEqual(4000);
  });

  it('keywords: comma-separated, no spaces, no word already in the name', () => {
    const words = appStore.keywords.split(',');
    expect(words.every((w) => w === w.trim() && w.length > 0)).toBe(true);
    const name = appStore.name.toLowerCase();
    expect(words.filter((w) => name.includes(w.toLowerCase()))).toEqual([]);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('Google Play', () => {
  it('fits the Play Console limits', () => {
    expect(googlePlay.title.length).toBeLessThanOrEqual(30);
    expect(googlePlay.shortDescription.length).toBeLessThanOrEqual(80);
    expect(fullDescription.length).toBeLessThanOrEqual(4000);
  });

  it('no promotional words or emoji in the title and short description (Play policy)', () => {
    for (const text of [googlePlay.title, googlePlay.shortDescription]) {
      expect(text).not.toMatch(/gratuit|meilleur|n°\s?1|top|promo|\p{Extended_Pictographic}/iu);
    }
  });
});

describe('content', () => {
  const texts = [appStore.description, appStore.promotionalText, googlePlay.shortDescription];

  it('never claims a medical benefit', () => {
    for (const text of texts) {
      expect(text).not.toMatch(
        /guéri|soigne|diagnostic|dose recommandée|efficacité|interaction détectée/i,
      );
    }
  });

  it('says it is not a medical device, and that the free version has ads', () => {
    expect(appStore.description).toMatch(/n'est pas un dispositif médical/);
    expect(appStore.description).toMatch(/publicités/);
  });

  it('describes the real snooze button', () => {
    expect(appStore.description).toContain(`« Dans ${SNOOZE_MINUTES} min »`);
  });
});
