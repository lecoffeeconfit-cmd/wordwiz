import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import AppContent from './src/application/AppContent';
import { initializeSentry, wrapWithSentry } from './src/services';
import { SubscriptionProvider } from './src/subscription/SubscriptionProvider';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

initializeSentry();

function App() {
  return (
    <SafeAreaProvider>
      <SubscriptionProvider>
        <AppContent />
      </SubscriptionProvider>
    </SafeAreaProvider>
  );
}

export default wrapWithSentry(App);
