import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { env } from '../config/env';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  // Auth sessions are available while the learner is using WordWiz, but are
  // not transferred to a different device through an iOS backup.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Keeps Supabase credentials in the operating system's encrypted credential
 * store. The AsyncStorage read is a one-time migration for existing learners
 * updating from older builds; it is deleted immediately after a secure write.
 */
const nativeAuthStorage = {
  async getItem(key: string) {
    try {
      const secureValue = await SecureStore.getItemAsync(key, secureStoreOptions);
      if (secureValue !== null) return secureValue;

      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue === null) return null;

      await SecureStore.setItemAsync(key, legacyValue, secureStoreOptions);
      await AsyncStorage.removeItem(key);
      return legacyValue;
    } catch {
      // Preserve the existing session if a device's secure store is temporarily
      // unavailable; the next successful access will migrate it.
      return AsyncStorage.getItem(key);
    }
  },
  async setItem(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value, secureStoreOptions);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string) {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key, secureStoreOptions),
      // Clear a session left behind by a pre-SecureStore WordWiz build too.
      AsyncStorage.removeItem(key),
    ]);
  },
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: nativeAuthStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (env.isSupabaseConfigured && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
