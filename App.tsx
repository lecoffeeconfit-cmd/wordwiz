import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import AppContent from './src/application/AppContent';
import { COLORS } from './src/constants/theme';
import {
  initializeSentry,
  reportStartupFailure,
  reportStartupStage,
} from './src/services';
import { SubscriptionProvider } from './src/subscription/SubscriptionProvider';

SplashScreen.setOptions({
  duration: 250,
  fade: true,
});

function App() {
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    // Initialize telemetry only after the root has committed, so telemetry can
    // never prevent the release app from reaching its startup screen.
    initializeSentry();
    reportStartupStage('navigation', 'completed');
  }, []);

  const retry = useCallback(() => setRetryKey((current) => current + 1), []);

  return (
    <StartupErrorBoundary key={retryKey} onRetry={retry}>
      <SafeAreaProvider>
        <SubscriptionProvider>
          <AppContent />
        </SubscriptionProvider>
      </SafeAreaProvider>
    </StartupErrorBoundary>
  );
}

class StartupErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportStartupFailure(error, 'navigation');
    // A render/import-path failure must not leave the native launch screen up.
    void SplashScreen.hideAsync().catch(() => {
      try {
        SplashScreen.hide();
      } catch {
        // There is no safe UI action left after a native splash fallback fails.
      }
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={startupStyles.screen}>
          <Text style={startupStyles.title}>WordWiz needs a fresh start</Text>
          <Text style={startupStyles.text}>
            The app could not finish opening. Your learning data is safe.
          </Text>
          <Text style={startupStyles.code}>STARTUP_NAVIGATION_FAILED</Text>
          <Pressable onPress={this.props.onRetry} style={startupStyles.button}>
            <Text style={startupStyles.buttonText}>RETRY</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const startupStyles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: '#F2EFFF',
  },
  title: { color: COLORS.purpleDark, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  text: { color: COLORS.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  code: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  button: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, backgroundColor: COLORS.purpleDark },
  buttonText: { color: COLORS.white, fontSize: 14, fontWeight: '900' },
});

export default App;
