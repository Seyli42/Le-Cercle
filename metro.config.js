// Sentry wraps Metro so that source maps are generated and uploaded on release builds.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
