import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppContent from './src/application/AppContent';
import { initializeSentry, wrapWithSentry } from './src/services';

initializeSentry();

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export default wrapWithSentry(App);
