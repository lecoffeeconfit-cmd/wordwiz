import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { styles } from '../styles';

export function ComplimentaryAccessModal({
  visible,
  expiresAt,
  onClose,
}: {
  visible: boolean;
  expiresAt: string | null;
  onClose: () => void;
}) {
  const cardProgress = useRef(new Animated.Value(0)).current;
  const wizardScale = useRef(new Animated.Value(0.55)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    cardProgress.setValue(0);
    wizardScale.setValue(0.55);
    sparkleProgress.setValue(0);

    const animation = Animated.sequence([
      Animated.delay(90),
      Animated.parallel([
        Animated.timing(cardProgress, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(wizardScale, {
          toValue: 1,
          friction: 5,
          tension: 88,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(sparkleProgress, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [cardProgress, sparkleProgress, visible, wizardScale]);

  const expiryLabel = getExpiryLabel(expiresAt);
  const cardTranslateY = cardProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const sparkleTranslateY = sparkleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [9, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.complimentaryWelcomeBackdrop}>
        <Animated.View
          style={[
            styles.complimentaryWelcomeCard,
            {
              opacity: cardProgress,
              transform: [{ translateY: cardTranslateY }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.complimentaryWelcomeSparkleTop,
              { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
            ]}
          >
            <Ionicons name="sparkles" size={21} color={COLORS.purple} />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.complimentaryWelcomeSparkleSide,
              { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
            ]}
          >
            <Ionicons name="star" size={13} color={COLORS.teal} />
          </Animated.View>

          <Animated.View
            style={[
              styles.complimentaryWelcomeWizard,
              { transform: [{ scale: wizardScale }] },
            ]}
          >
            <Ionicons name="sparkles" size={38} color={COLORS.purpleDark} />
          </Animated.View>

          <View style={styles.complimentaryWelcomeEyebrow}>
            <Ionicons name="gift-outline" size={13} color={COLORS.purpleDark} />
            <Text style={styles.complimentaryWelcomeEyebrowText}>A LITTLE WORDWIZ MAGIC</Text>
          </View>
          <Text style={styles.complimentaryWelcomeTitle}>Welcome, Spell Wizard!</Text>
          <Text style={styles.complimentaryWelcomeBody}>
            Your 30 days of complimentary WordWiz Plus have begun. Every learning tool is ready for you to explore.
          </Text>

          <View style={styles.complimentaryWelcomeBenefits}>
            <Benefit icon="infinite-outline" text="Unlimited new words" />
            <Benefit icon="trophy-outline" text="All quizzes and learning modes" />
            <Benefit icon="analytics-outline" text="Progress and memory insights" />
          </View>

          <View style={styles.complimentaryWelcomeExpiry}>
            <Ionicons name="calendar-outline" size={17} color={COLORS.purpleDark} />
            <Text style={styles.complimentaryWelcomeExpiryText}>Full access through {expiryLabel}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start exploring WordWiz Plus"
            onPress={onClose}
            style={({ pressed }) => [
              styles.complimentaryWelcomeButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.complimentaryWelcomeButtonText}>LET’S LEARN</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Benefit({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.complimentaryWelcomeBenefit}>
      <View style={styles.complimentaryWelcomeBenefitIcon}>
        <Ionicons name={icon} size={16} color={COLORS.teal} />
      </View>
      <Text style={styles.complimentaryWelcomeBenefitText}>{text}</Text>
      <Ionicons name="checkmark" size={17} color={COLORS.greenDark} />
    </View>
  );
}

function getExpiryLabel(expiresAt: string | null) {
  if (!expiresAt) return 'the next 30 days';

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return 'the next 30 days';

  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
