// Native ad and purchase SDKs do not exist in Jest: minimal stand-ins, inspectable from
// tests with jest.requireMock(...).
jest.mock('react-native-google-mobile-ads', () => {
  const interstitial = {
    loaded: true,
    load: jest.fn(),
    show: jest.fn(async () => undefined),
    addAdEventListener: jest.fn(() => () => undefined),
  };
  const mobileAds = {
    initialize: jest.fn(async () => []),
    setRequestConfiguration: jest.fn(async () => undefined),
  };
  return {
    __esModule: true,
    default: () => mobileAds,
    mobileAdsInstance: mobileAds,
    interstitial,
    AdsConsent: {
      gatherConsent: jest.fn(async () => ({})),
      requestInfoUpdate: jest.fn(async () => ({})),
      getConsentInfo: jest.fn(async () => ({
        status: 'OBTAINED',
        canRequestAds: true,
        privacyOptionsRequirementStatus: 'REQUIRED',
        isConsentFormAvailable: true,
      })),
      showPrivacyOptionsForm: jest.fn(async () => ({ canRequestAds: true })),
    },
    AdsConsentPrivacyOptionsRequirementStatus: {
      UNKNOWN: 'UNKNOWN',
      REQUIRED: 'REQUIRED',
      NOT_REQUIRED: 'NOT_REQUIRED',
    },
    AdEventType: { LOADED: 'loaded', ERROR: 'error', OPENED: 'opened', CLOSED: 'closed' },
    MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
    TestIds: { ADAPTIVE_BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial' },
    InterstitialAd: { createForAdRequest: jest.fn(() => interstitial) },
    BannerAd: () => null,
  };
});

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    logIn: jest.fn(async () => ({
      customerInfo: { entitlements: { active: {} } },
      created: false,
    })),
    logOut: jest.fn(async () => ({ entitlements: { active: {} } })),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(async () => ({ entitlements: { active: {} } })),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(() => true),
  },
  PACKAGE_TYPE: { MONTHLY: 'MONTHLY', ANNUAL: 'ANNUAL', LIFETIME: 'LIFETIME', CUSTOM: 'CUSTOM' },
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    STORE_PROBLEM_ERROR: '2',
    PURCHASE_NOT_ALLOWED_ERROR: '3',
    NETWORK_ERROR: '10',
    PAYMENT_PENDING_ERROR: '20',
  },
}));
