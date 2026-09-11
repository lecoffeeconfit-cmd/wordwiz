const {
  AndroidConfig,
  withAndroidManifest,
} = require('expo/config-plugins');

/**
 * RevenueCat requires standard or singleTop so Google Play purchase
 * verification can return to the existing purchase flow without cancelling it.
 */
module.exports = function withAndroidMainActivitySingleTop(config) {
  return withAndroidManifest(config, (androidConfig) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      androidConfig.modResults,
    );
    mainActivity.$['android:launchMode'] = 'singleTop';
    return androidConfig;
  });
};
