import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import AppContent from './src/application/AppContent';
import { initializeSentry, wrapWithSentry } from './src/services';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

initializeSentry();

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export default wrapWithSentry(App);
