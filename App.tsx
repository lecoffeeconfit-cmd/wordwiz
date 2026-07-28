import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import AppContent from './src/application/AppContent';
import { initializeSentry, wrapWithSentry } from './src/services';
import { SubscriptionProvider } from './src/subscription/SubscriptionProvider';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The native splash may already be hidden during a reload. Either state is safe.
});
SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

initializeSentry();

function App() {
  useEffect(() => {
    // AppContent hides the splash as soon as its loading UI is mounted. Keep a
    // small fallback so a startup exception can never leave people trapped on
    // the native launch screen indefinitely.
    const splashFallbackTimeout = setTimeout(() => {
      try {
        SplashScreen.hide();
      } catch {
        // The splash was already hidden; there is nothing else to recover.
      }
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

export default wrapWithSentry(App);
