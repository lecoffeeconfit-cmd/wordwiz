import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import AppContent from './src/application/AppContent';
import { initializeSentry, reportStartupStage } from './src/services';
import { SubscriptionProvider } from './src/subscription/SubscriptionProvider';

SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

function App() {
  useEffect(() => {
    // Initialize telemetry only after the root has committed, so telemetry can
    // never prevent the release app from reaching its startup screen.
    initializeSentry();
    reportStartupStage('navigation', 'completed');

    // We intentionally do not call preventAutoHideAsync. Expo's default native
    // behavior is safer if JS fails before React mounts. This is a final guard
    // for normal startup and handled startup failures.
    const splashFallbackTimeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => undefined);
    }, 1500);

    return () => clearTimeout(splashFallbackTimeout);
  }, []);

  return (
    <SafeAreaProvider>
      <SubscriptionProvider>
        <AppContent />
      </SubscriptionProvider>
    </SafeAreaProvider>
  );
}

export default App;
