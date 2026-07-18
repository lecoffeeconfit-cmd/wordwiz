import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';

const GLOSS_COLORS = [
  'rgba(255,255,255,0.28)',
  'rgba(255,255,255,0.08)',
  'rgba(255,255,255,0)',
] as const;

function ProgressSparkle({
  color,
  delay,
  driftY,
  size,
}: {
  color: string;
  delay: number;
  driftY: number;
  size: number;
}) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.45);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(driftY);

  useEffect(() => {
    const easing = Easing.out(Easing.cubic);

    opacity.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(0.95, { duration: 160, easing })),
        withTiming(0, { duration: 620, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    scale.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1.1, { duration: 160, easing })),
        withTiming(0.58, { duration: 620, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    translateX.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(3, { duration: 160, easing })),
        withTiming(17, { duration: 620, easing }),
      ),
      -1,
      false,
    );
    translateY.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(driftY - 4, { duration: 160, easing })),
        withTiming(driftY - 17, { duration: 620, easing }),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(scale);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
    };
  }, [delay, driftY, opacity, scale, translateX, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          left: -size / 2,
          top: -size / 2,
          shadowColor: color,
        },
        animatedStyle,
      ]}
    >
      <Ionicons name="sparkles" size={size} color={COLORS.white} />
    </Animated.View>
  );
}

export function ProgressFill({
  progress,
  color,
  radius,
  style,
}: {
  progress: number;
  color: string;
  radius: number;
  style?: StyleProp<ViewStyle>;
}) {
  const safeProgress = Math.max(0, Math.min(100, progress));
  const hasGlow = safeProgress >= 50;
  const isGlossy = safeProgress >= 75;
  const hasSparkles = safeProgress >= 95;
  const glossOpacity = 0.16 + ((safeProgress - 75) / 25) * 0.16;

  return (
    <View
      style={[
        styles.container,
        style,
        hasGlow && {
          shadowColor: color,
          shadowOpacity: 0.48,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 3,
        },
      ]}
    >
      <View style={[styles.surface, { borderRadius: radius, backgroundColor: color }]}>
        {isGlossy ? (
          <LinearGradient
            colors={GLOSS_COLORS}
            end={{ x: 1, y: 1 }}
            pointerEvents="none"
            start={{ x: 0, y: 0 }}
            style={[StyleSheet.absoluteFill, { opacity: glossOpacity }]}
          />
        ) : null}
      </View>
      {hasSparkles ? (
        <View pointerEvents="none" style={styles.sparkleLayer}>
          <ProgressSparkle color={color} delay={0} driftY={2} size={11} />
          <ProgressSparkle color={color} delay={260} driftY={8} size={8} />
          <ProgressSparkle color={color} delay={520} driftY={-5} size={7} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
  },
  surface: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  sparkleLayer: {
    position: 'absolute',
    top: '50%',
    right: 0,
    width: 1,
    height: 1,
    overflow: 'visible',
  },
  sparkle: {
    position: 'absolute',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
