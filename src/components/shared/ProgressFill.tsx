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

function mixHexColors(base: string, target: string, amount: number) {
  const safeAmount = Math.max(0, Math.min(1, amount));
  const normalizedBase = base.replace('#', '');
  const normalizedTarget = target.replace('#', '');

  if (normalizedBase.length !== 6 || normalizedTarget.length !== 6) {
    return base;
  }

  const channels = [0, 2, 4].map((offset) => {
    const from = Number.parseInt(normalizedBase.slice(offset, offset + 2), 16);
    const to = Number.parseInt(normalizedTarget.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * safeAmount)
      .toString(16)
      .padStart(2, '0');
  });

  return `#${channels.join('')}`;
}

function ProgressSparkle({
  delay,
  driftY,
  size,
}: {
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
        },
        animatedStyle,
      ]}
    >
      <Ionicons name="sparkles" size={size} color="#FFF0AD" />
    </Animated.View>
  );
}

function ProgressGlow({ color, strength }: { color: string; strength: number }) {
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1050, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.55, { duration: 1050, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );

    return () => cancelAnimation(pulse);
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: (0.18 + strength * 0.2) * pulse.value,
    transform: [{ scaleY: 1 + pulse.value * 0.16 }],
  }));

  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={[
        styles.glowHalo,
        {
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.72,
          shadowRadius: 7,
          shadowOffset: { width: 0, height: 0 },
          elevation: 3,
        },
        animatedStyle,
      ]}
    />
  );
}

function ProgressGlossSweep() {
  const translateX = useSharedValue(-12);
  const opacity = useSharedValue(0.18);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(15, { duration: 950, easing: Easing.inOut(Easing.quad) }),
        withDelay(680, withTiming(-12, { duration: 0 })),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.68, { duration: 500, easing: Easing.out(Easing.quad) }),
        withTiming(0.18, { duration: 450, easing: Easing.in(Easing.quad) }),
        withDelay(680, withTiming(0.18, { duration: 0 })),
      ),
      -1,
      false,
    );

    return () => {
      cancelAnimation(translateX);
      cancelAnimation(opacity);
    };
  }, [opacity, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { rotate: '-18deg' }],
  }));

  return (
    <Animated.View
      accessible={false}
      pointerEvents="none"
      style={[styles.glossSweep, animatedStyle]}
    >
      <LinearGradient
        colors={[
          'rgba(255,186,48,0)',
          'rgba(255,214,104,0.98)',
          'rgba(255,186,48,0)',
        ]}
        end={{ x: 1, y: 0 }}
        start={{ x: 0, y: 1 }}
        style={styles.glossGradient}
      />
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
  const hasSparkles = safeProgress >= 90;
  const glowStrength = Math.min(1, Math.max(0, (safeProgress - 50) / 50));
  const polishedColors = [
    mixHexColors(color, COLORS.white, 0.1),
    color,
    mixHexColors(color, COLORS.ink, 0.1),
  ] as const;

  return (
    <View
      style={[
        styles.container,
        style,
      ]}
    >
      {hasGlow ? <ProgressGlow color={color} strength={glowStrength} /> : null}
      {isGlossy ? (
        <LinearGradient
          colors={polishedColors}
          end={{ x: 0, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.surface, { borderRadius: radius }]}
        >
          <ProgressGlossSweep />
        </LinearGradient>
      ) : (
        <View style={[styles.surface, { borderRadius: radius, backgroundColor: color }]} />
      )}
      {hasSparkles ? (
        <View pointerEvents="none" style={styles.sparkleLayer}>
          <ProgressSparkle delay={0} driftY={2} size={10} />
          {safeProgress >= 95 ? (
            <ProgressSparkle delay={360} driftY={-5} size={8} />
          ) : null}
          {safeProgress >= 99 ? (
            <ProgressSparkle delay={720} driftY={5} size={6} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    overflow: 'visible',
    position: 'relative',
  },
  surface: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  glowHalo: {
    position: 'absolute',
    top: -3,
    right: -4,
    bottom: -3,
    left: -4,
    borderRadius: 999,
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
  },
  glossSweep: {
    position: 'absolute',
    top: -8,
    right: 5,
    width: 18,
    height: 52,
  },
  glossGradient: {
    flex: 1,
    borderRadius: 10,
  },
});
