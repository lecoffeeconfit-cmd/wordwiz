import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS } from '../constants/theme';
import { validateEmail, validateName, validatePassword } from '../services';
import { styles } from '../styles';

type AuthMode = 'login' | 'create' | 'forgot';

export function LoginScreen({
  onLogin,
  onCreateAccount,
  onForgotPassword,
}: {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onCreateAccount: (
    name: string,
    email: string,
    password: string,
  ) => Promise<boolean>;
  onForgotPassword: (email: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCreateMode = mode === 'create';
  const isForgotMode = mode === 'forgot';

  async function submit() {
    const emailError = validateEmail(email);
    const nameError = isCreateMode ? validateName(name) : null;
    const passwordError = !isForgotMode ? validatePassword(password) : null;

    if (emailError) {
      Alert.alert('Check your email', emailError);
      return;
    }

    if (isForgotMode) {
      onForgotPassword(email);
      return;
    }

    if (passwordError) {
      Alert.alert('Check your password', passwordError);
      return;
    }

    if (nameError) {
      Alert.alert('Check your name', nameError);
      return;
    }

    setIsSubmitting(true);
    const success = isCreateMode
      ? await onCreateAccount(name, email, password)
      : await onLogin(email, password);
    setIsSubmitting(false);

    if (success) {
      setPassword('');
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authKeyboard}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.authContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authHero}>
          <View style={styles.authCloudOne} />
          <View style={styles.authCloudTwo} />
          <View style={styles.authLogo}>
            <Ionicons name="sparkles" size={30} color={COLORS.white} />
          </View>
          <Text style={styles.authKicker}>WORDWIZ</Text>
          <Text style={styles.authTitle}>
            {isCreateMode
              ? 'Start your word journey'
              : isForgotMode
                ? 'Reset your password'
                : 'Welcome back'}
          </Text>
          <Text style={styles.authSubtitle}>
            {isCreateMode
              ? 'Create a profile to save your words, quizzes, and streaks.'
              : isForgotMode
                ? 'Enter your email and WordWiz will show safe recovery guidance.'
                : 'Sign in to keep building your vocabulary one friendly review at a time.'}
          </Text>
        </View>

        <View style={styles.authCard}>
          {isCreateMode && (
            <AuthField
              icon="person-outline"
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Alex"
              autoCapitalize="words"
            />
          )}
          <AuthField
            icon="mail-outline"
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {!isForgotMode && (
            <AuthField
              icon="lock-closed-outline"
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
            />
          )}
          {isCreateMode && (
            <Text style={styles.authPasswordHint}>
              Use 8+ characters with at least one letter and one number.
            </Text>
          )}

          {!isForgotMode && (
            <Pressable
              onPress={() => setMode('forgot')}
              style={styles.forgotLink}
            >
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </Pressable>
          )}

          <Pressable
            onPress={submit}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.authPrimaryButton,
              isSubmitting && styles.authPrimaryButtonDisabled,
              pressed && !isSubmitting && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.authPrimaryButtonText}>
              {isSubmitting
                ? 'One moment...'
                : isCreateMode
                  ? 'Create account'
                  : isForgotMode
                    ? 'Get reset help'
                    : 'Log in'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </Pressable>

          <View style={styles.authSwitchRow}>
            <Text style={styles.authSwitchText}>
              {isCreateMode
                ? 'Already have an account?'
                : isForgotMode
                  ? 'Remembered it?'
                  : 'New to WordWiz?'}
            </Text>
            <Pressable
              onPress={() => {
                setMode(isCreateMode || isForgotMode ? 'login' : 'create');
                setPassword('');
              }}
            >
              <Text style={styles.authSwitchAction}>
                {isCreateMode || isForgotMode ? 'Log in' : 'Create one'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.authNoteCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.blue} />
          <Text style={styles.authNoteText}>
            This prototype stores accounts locally on this device. A production
            version should use a secure backend for sessions and password resets.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthField({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = 'sentences',
  keyboardType = 'default',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={styles.authFieldGroup}>
      <Text style={styles.authFieldLabel}>{label}</Text>
      <View style={styles.authInputWrap}>
        <Ionicons name={icon} size={20} color={COLORS.purpleDark} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          style={styles.authInput}
        />
      </View>
    </View>
  );
}
