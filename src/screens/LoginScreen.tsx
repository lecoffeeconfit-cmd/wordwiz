import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
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
  isPasswordRecovery,
  onUpdatePassword,
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
  isPasswordRecovery: boolean;
  onUpdatePassword: (password: string) => Promise<boolean>;
  onOAuthLogin: (provider: Provider, label: string) => Promise<boolean>;
  onResendVerification: (email: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const nameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const passwordConfirmationInputRef = useRef<TextInput>(null);
  const focusedInputRef = useRef<TextInput | null>(null);
  const scrollOffsetRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  const focusScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isCreateMode = mode === 'create';
  const isForgotMode = mode === 'forgot';
  const isRecoveryMode = isPasswordRecovery;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const keyboardShowSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardHeightRef.current = event.endCoordinates.height;
      // Focus usually fires before the keyboard has finished opening. Re-run
      // the visibility check after the keyboard reports its final height so
      // the focused field (especially Password) stays above it.
      if (focusedInputRef.current) {
        keepFocusedInputVisible(focusedInputRef.current);
      }
    });
    const keyboardHideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeightRef.current = 0;
      focusedInputRef.current = null;
    });

    return () => {
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
      if (focusScrollTimer.current) {
        clearTimeout(focusScrollTimer.current);
      }
    };
  }, []);

  function keepFocusedInputVisible(input: TextInput | null) {
    focusedInputRef.current = input;
    if (focusScrollTimer.current) {
      clearTimeout(focusScrollTimer.current);
    }

    focusScrollTimer.current = setTimeout(() => {
      if (!input || keyboardHeightRef.current === 0) return;

      input.measureInWindow((_x, y, _width, height) => {
        const keyboardTop = Dimensions.get('window').height - keyboardHeightRef.current;
        const inputBottom = y + height;
        const spaceAboveKeyboard = 20;
        const scrollDistance = inputBottom + spaceAboveKeyboard - keyboardTop;

        if (scrollDistance > 0) {
          scrollViewRef.current?.scrollTo({
            y: scrollOffsetRef.current + scrollDistance,
            animated: true,
          });
        }
      });
    }, Platform.OS === 'ios' ? 200 : 100);
  }

  async function submit() {
    if (isRecoveryMode) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        Alert.alert('Check your password', passwordError);
        return;
      }
      if (password !== passwordConfirmation) {
        Alert.alert('Passwords do not match', 'Enter the same new password in both fields.');
        return;
      }

      setIsSubmitting(true);
      const success = await onUpdatePassword(password);
      setIsSubmitting(false);
      if (success) {
        setPassword('');
        setPasswordConfirmation('');
      }
      return;
    }

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
        ref={scrollViewRef}
        style={styles.screen}
        contentContainerStyle={styles.authContent}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
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
              : isRecoveryMode
                ? 'Choose a new password'
                : isForgotMode
                ? 'Reset your password'
                : 'Welcome back'}
          </Text>
          <Text style={styles.authSubtitle}>
            {isCreateMode
              ? 'Create a profile to save your words, quizzes, and streaks.'
              : isRecoveryMode
                ? 'This secure link is temporary. Set a new password to continue learning.'
                : isForgotMode
                  ? 'Enter your email and we’ll send a secure reset link if an account exists.'
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
                  We sent a confirmation link to {verificationEmail}. Open it
                  to return here and finish signing in.
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

          {!isForgotMode && !isRecoveryMode && (
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

          {isCreateMode && !isRecoveryMode && (
            <AuthField
              icon="person-outline"
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Alex"
              autoCapitalize="words"
              inputRef={nameInputRef}
              onFocus={() => keepFocusedInputVisible(nameInputRef.current)}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailInputRef.current?.focus()}
            />
          )}
          {!isRecoveryMode ? <AuthField
            icon="mail-outline"
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            inputRef={emailInputRef}
            onFocus={() => keepFocusedInputVisible(emailInputRef.current)}
            returnKeyType={isForgotMode ? 'done' : 'next'}
            blurOnSubmit={isForgotMode}
            onSubmitEditing={isForgotMode
              ? () => { void submit(); }
              : () => passwordInputRef.current?.focus()}
          /> : null}
          {!isForgotMode && !isRecoveryMode && (
            <AuthField
              icon="lock-closed-outline"
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              inputRef={passwordInputRef}
              onFocus={() => keepFocusedInputVisible(passwordInputRef.current)}
              returnKeyType="done"
              onSubmitEditing={() => { void submit(); }}
            />
          )}
          {isRecoveryMode && (
            <>
              <AuthField
                icon="lock-closed-outline"
                label="New password"
                value={password}
                onChangeText={setPassword}
                placeholder="Create a new password"
                secureTextEntry
                inputRef={passwordInputRef}
                onFocus={() => keepFocusedInputVisible(passwordInputRef.current)}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordConfirmationInputRef.current?.focus()}
              />
              <AuthField
                icon="shield-checkmark-outline"
                label="Confirm new password"
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
                placeholder="Repeat your new password"
                secureTextEntry
                inputRef={passwordConfirmationInputRef}
                onFocus={() => keepFocusedInputVisible(passwordConfirmationInputRef.current)}
                returnKeyType="done"
                onSubmitEditing={() => { void submit(); }}
              />
            </>
          )}
          {(isCreateMode || isRecoveryMode) && (
            <Text style={styles.authPasswordHint}>
              Use 8+ characters with at least one letter and one number.
            </Text>
          )}

          {!isForgotMode && !isRecoveryMode && (
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
                  : isRecoveryMode
                    ? 'Save new password'
                  : isForgotMode
                    ? 'Send reset link'
                    : 'Log in'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </Pressable>

          {!isRecoveryMode && <View style={styles.authSwitchRow}>
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
          </View>}
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
  const quadrants = [
    {
      color: '#EA4335',
      clip: styles.oauthGoogleClipTopLeft,
      icon: styles.oauthGoogleIconTopLeft,
    },
    {
      color: '#FBBC05',
      clip: styles.oauthGoogleClipTopRight,
      icon: styles.oauthGoogleIconTopRight,
    },
    {
      color: '#34A853',
      clip: styles.oauthGoogleClipBottomLeft,
      icon: styles.oauthGoogleIconBottomLeft,
    },
    {
      color: '#4285F4',
      clip: styles.oauthGoogleClipBottomRight,
      icon: styles.oauthGoogleIconBottomRight,
    },
  ];

  return (
    <View style={styles.oauthGoogleLogo}>
      {quadrants.map((quadrant) => (
        <View
          key={quadrant.color}
          pointerEvents="none"
          style={[styles.oauthGoogleClip, quadrant.clip]}
        >
          <Ionicons
            name="logo-google"
            size={22}
            color={quadrant.color}
            style={[styles.oauthGoogleIcon, quadrant.icon]}
          />
        </View>
      ))}
      <View style={styles.oauthGoogleCrossbar} />
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
  inputRef,
  onFocus,
  onSubmitEditing,
  returnKeyType,
  blurOnSubmit,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address';
  inputRef?: React.RefObject<TextInput | null>;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next';
  blurOnSubmit?: boolean;
}) {
  return (
    <View style={styles.authFieldGroup}>
      <Text style={styles.authFieldLabel}>{label}</Text>
      <View style={styles.authInputWrap}>
        <Ionicons name={icon} size={20} color={COLORS.purpleDark} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.muted}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          onFocus={onFocus}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          blurOnSubmit={blurOnSubmit}
          style={styles.authInput}
        />
      </View>
    </View>
  );
}
