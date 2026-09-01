import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, FLOATING_SHADOW } from '../../constants/theme';

const CHAMPION_GRADIENT_COLORS = ['#9BE2C8', '#ADD3F4', '#C0B4F2', '#EFCF8B'] as const;

type AchievementCelebration = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  points: number;
  refreshTokens: number;
};

export function AchievementUnlockedBanner({
  celebrationId,
  achievement,
  onOpenAchievements,
  onFinished,
}: {
  celebrationId: string;
  achievement: AchievementCelebration;
  onOpenAchievements: () => void;
  onFinished: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    progress.setValue(0);
    sparkleProgress.setValue(0);
    try {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch {
      // Haptic feedback is optional and must never interrupt the app.
    }

    let isActive = true;
    let hasFinished = false;
    const finish = () => {
      if (!isActive || hasFinished) return;
      hasFinished = true;
      onFinishedRef.current();
    };
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.back(1.08)),
          useNativeDriver: true,
        }),
        Animated.delay(2600),
        Animated.timing(progress, {
          toValue: 0,
          duration: 360,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(sparkleProgress, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(sparkleProgress, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) finish();
    });
    const finishTimeout = setTimeout(finish, 4200);

    return () => {
      isActive = false;
      clearTimeout(finishTimeout);
      animation.stop();
    };
  }, [celebrationId, progress, sparkleProgress]);

  const cardOpacity = progress.interpolate({
    inputRange: [0, 0.14, 0.86, 1],
    outputRange: [0, 1, 1, 0],
  });
  const cardTranslateY = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [-18, 0, 4],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0.96, 1, 0.99],
  });
  const sparkleOpacity = sparkleProgress.interpolate({
    inputRange: [0, 0.2, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  });
  const sparkleLift = sparkleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, -10],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        celebrationStyles.container,
        {
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          celebrationStyles.sparkle,
          celebrationStyles.sparkleOne,
          { opacity: sparkleOpacity, transform: [{ translateY: sparkleLift }] },
        ]}
      >
        <Ionicons name="sparkles" size={17} color={COLORS.purple} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          celebrationStyles.sparkle,
          celebrationStyles.sparkleTwo,
          {
            opacity: sparkleOpacity,
            transform: [{ translateY: sparkleLift }, { scale: 0.75 }],
          },
        ]}
      >
        <Ionicons name="star" size={13} color={COLORS.teal} />
      </Animated.View>
      <View style={celebrationStyles.card}>
        <LinearGradient
          pointerEvents="none"
          colors={CHAMPION_GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={celebrationStyles.cardGradient}
        />
        <LinearGradient
          pointerEvents="none"
          colors={CHAMPION_GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={celebrationStyles.championAccent}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(222,212,255,0.28)', 'rgba(201,240,227,0.16)', 'rgba(255,251,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={celebrationStyles.championWash}
        />
        <View style={[celebrationStyles.iconBadge, { backgroundColor: achievement.background }]}>
          <Ionicons name={achievement.icon} size={24} color={achievement.color} />
          <View style={celebrationStyles.checkBadge}>
            <Ionicons name="checkmark" size={10} color={COLORS.white} />
          </View>
        </View>
        <View style={celebrationStyles.copy}>
          <Text style={celebrationStyles.eyebrow}>ACHIEVEMENT COMPLETED</Text>
          <Text style={celebrationStyles.title}>
            {achievement.title}
          </Text>
          <Text style={celebrationStyles.reward}>
            +{achievement.points} pts · +{achievement.refreshTokens} refresh
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View achievements"
          accessibilityHint="Opens achievement details in Stats"
          onPress={() => {
            onFinished();
            onOpenAchievements();
          }}
          style={({ pressed }) => [celebrationStyles.viewButton, pressed && celebrationStyles.viewButtonPressed]}
        >
          <Ionicons name="chevron-forward" size={20} color={COLORS.purpleDark} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const celebrationStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 12,
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 86,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBFF',
    borderWidth: 1,
    borderColor: '#E3DFFF',
    ...FLOATING_SHADOW,
  },
  cardGradient: {
    ...StyleSheet.absoluteFill,
    opacity: 0.22,
  },
  championAccent: {
    position: 'absolute',
    top: 0,
    left: 18,
    right: 18,
    height: 4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    opacity: 0.9,
  },
  championWash: {
    position: 'absolute',
    width: 118,
    height: 118,
    top: -61,
    right: -46,
    borderRadius: 59,
    opacity: 0.72,
  },
  iconBadge: {
    position: 'relative',
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  checkBadge: {
    position: 'absolute',
    right: -5,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.teal,
    borderWidth: 2,
    borderColor: '#FFFBFF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: COLORS.purpleDark,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  title: {
    marginTop: 2,
    flexShrink: 1,
    color: COLORS.ink,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
  },
  reward: {
    marginTop: 2,
    flexShrink: 1,
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  viewButton: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242,239,255,0.9)',
  },
  viewButtonPressed: {
    opacity: 0.65,
    transform: [{ scale: 0.94 }],
  },
  sparkle: {
    position: 'absolute',
    zIndex: 2,
  },
  sparkleOne: {
    top: -7,
    right: 42,
  },
  sparkleTwo: {
    top: 8,
    left: 38,
  },
});
