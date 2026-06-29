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
import type { Provider } from '@supabase/supabase-js';

type AuthMode = 'login' | 'create' | 'forgot';

export function LoginScreen({
  onLogin,
  onCreateAccount,
  onForgotPassword,
  onOAuthLogin,
  onResendVerification,
}: {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onCreateAccount: (
    name: string,
    email: string,
    password: string,
  ) => Promise<boolean>;
  onForgotPassword: (email: string) => Promise<void>;
  onOAuthLogin: (provider: Provider, label: string) => Promise<boolean>;
  onResendVerification: (email: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);

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
      setIsSubmitting(true);
      await onForgotPassword(email);
      setIsSubmitting(false);
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
      if (isCreateMode) {
        setVerificationEmail(email.trim());
        setMode('login');
      }
    }
  }

  async function resendVerification() {
    const targetEmail = verificationEmail || email;

    setIsResendingVerification(true);
    const success = await onResendVerification(targetEmail);
    setIsResendingVerification(false);

    if (success) {
      setVerificationEmail(targetEmail.trim());
    }
  }

  async function continueWithProvider(provider: Provider, label: string) {
    setIsSubmitting(true);
    await onOAuthLogin(provider, label);
    setIsSubmitting(false);
  }

  const providers: {
    provider: Provider;
    label: string;
    logo: 'google' | 'apple';
    background: string;
  }[] = [
    {
      provider: 'google',
      label: 'Google',
      logo: 'google',
      background: '#F2F7FF',
    },
    {
      provider: 'apple',
      label: 'Apple',
      logo: 'apple',
      background: '#F5F5FA',
    },
  ];

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
          {verificationEmail ? (
            <View style={styles.verificationCard}>
              <View style={styles.verificationIcon}>
                <Ionicons name="mail-unread-outline" size={22} color={COLORS.blue} />
              </View>
              <View style={styles.verificationCopy}>
                <Text style={styles.verificationTitle}>Verify your email</Text>
                <Text style={styles.verificationText}>
                  We sent a confirmation link to {verificationEmail}. Open it,
                  then log in here.
                </Text>
                <Pressable
                  onPress={resendVerification}
                  disabled={isResendingVerification}
                  style={({ pressed }) => [
                    styles.verificationResendButton,
                    isResendingVerification && styles.authPrimaryButtonDisabled,
                    pressed && !isResendingVerification && styles.pressed,
                  ]}
                >
                  <Text style={styles.verificationResendText}>
                    {isResendingVerification ? 'Sending...' : 'Resend email'}
                  </Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityLabel="Dismiss verification message"
                onPress={() => setVerificationEmail('')}
                style={styles.verificationDismiss}
              >
                <Ionicons name="close" size={17} color={COLORS.muted} />
              </Pressable>
            </View>
          ) : null}

          {!isForgotMode && (
            <>
              <View style={styles.oauthGrid}>
                {providers.map((item) => (
                  <Pressable
                    key={item.provider}
                    onPress={() => continueWithProvider(item.provider, item.label)}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.oauthButton,
                      isSubmitting && styles.authPrimaryButtonDisabled,
                      pressed && !isSubmitting && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.oauthIconBadge,
                        { backgroundColor: item.background },
                      ]}
                    >
                      <OAuthLogo logo={item.logo} />
                    </View>
                    <Text style={styles.oauthButtonText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.authDividerRow}>
                <View style={styles.authDividerLine} />
                <Text style={styles.authDividerText}>Email sign in</Text>
                <View style={styles.authDividerLine} />
              </View>
            </>
          )}

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
            WordWiz uses Supabase Auth for accounts, email verification,
            sessions, and password reset emails.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function OAuthLogo({ logo }: { logo: 'google' | 'apple' | 'microsoft' }) {
  if (logo === 'google') {
    return <GoogleLogo />;
  }

  if (logo === 'microsoft') {
    return (
      <View style={styles.oauthMicrosoftLogo}>
        <View style={[styles.oauthMicrosoftTile, { backgroundColor: '#F25022' }]} />
        <View style={[styles.oauthMicrosoftTile, { backgroundColor: '#7FBA00' }]} />
        <View style={[styles.oauthMicrosoftTile, { backgroundColor: '#00A4EF' }]} />
        <View style={[styles.oauthMicrosoftTile, { backgroundColor: '#FFB900' }]} />
      </View>
    );
  }

  return <Ionicons name="logo-apple" size={22} color={COLORS.ink} />;
}

function GoogleLogo() {
  return (
    <View style={styles.oauthGoogleLogo}>
      <Ionicons name="logo-google" size={21} color="#4285F4" />
    </View>
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
