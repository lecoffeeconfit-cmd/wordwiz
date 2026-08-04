import { FontAwesome6, Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { COLORS } from '../../constants/theme';
import type { CommunityLevel } from '../../services/community';

type FontAwesomeIconName = ComponentProps<typeof FontAwesome6>['name'];

type LeaderboardRankBadgeProps = {
  rank: number | null | undefined;
  level?: CommunityLevel;
  size?: number;
  testID?: string;
  accessibilityLabel?: string;
  rankTextStyle?: StyleProp<TextStyle>;
};

type LevelMagicIconProps = {
  level: CommunityLevel;
  size: number;
  variant?: 'filled' | 'outline' | 'bare' | 'progressCircle';
  color?: string;
};

type LevelBadgeConfig = {
  icon: FontAwesomeIconName;
  color: string;
  background: string;
  animation: 'twinkle' | 'sparkle' | 'float' | 'shimmer' | 'rune-shimmer' | 'pulse' | 'prestige';
  hasAccentSparkle?: boolean;
  hasRune?: boolean;
  secondaryColor: string;
  progressAccent?: FontAwesomeIconName;
  progressAura?: boolean;
};

const TOP_THREE = {
  1: { color: '#D3A12C', background: '#FFF3C9' },
  2: { color: '#9AA6B6', background: '#F1F3F6' },
  3: { color: '#B8754F', background: '#FBE9DE' },
} as const;

const LEVEL_BADGES: Record<CommunityLevel, LevelBadgeConfig> = {
  Novice: {
    icon: 'star',
    color: '#69A4D7',
    background: '#E5F2FF',
    animation: 'twinkle',
    secondaryColor: '#2879E8',
    progressAccent: 'star',
  },
  Apprentice: {
    icon: 'wand-sparkles',
    color: '#36BDA2',
    background: '#E1F8F4',
    animation: 'sparkle',
    hasAccentSparkle: true,
    secondaryColor: '#39C69A',
    progressAccent: 'star',
  },
  Journeyman: {
    icon: 'hat-wizard',
    color: '#3CCFC4',
    background: '#D9F7F3',
    animation: 'float',
    secondaryColor: '#3CCFC4',
    progressAccent: 'star',
  },
  Adept: {
    icon: 'scroll',
    color: '#FFD23F',
    background: '#FFF2B8',
    animation: 'rune-shimmer',
    hasRune: true,
    secondaryColor: '#FFD23F',
  },
  Mage: {
    icon: 'atom',
    color: '#8067E8',
    background: '#EEE9FF',
    animation: 'pulse',
    secondaryColor: '#5B4DE4',
    progressAura: true,
  },
  Master: {
    icon: 'wand-magic-sparkles',
    color: '#F19A45',
    background: '#FFF0DF',
    animation: 'shimmer',
    hasAccentSparkle: true,
    secondaryColor: '#F2A65A',
    progressAccent: 'diamond',
  },
  Grandmaster: {
    icon: 'ribbon',
    color: '#B98416',
    background: '#FFF1CB',
    animation: 'prestige',
    hasAccentSparkle: true,
    secondaryColor: '#B98416',
    progressAccent: 'star',
    progressAura: true,
  },
};

function useReducedMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function useSoftLoop(
  enabled: boolean,
  duration: number,
  delay: number,
  reduceMotion: boolean,
) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!enabled || reduceMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.delay(Math.round(duration * 1.5)),
      ]),
    );
    animation.start();

    return () => animation.stop();
  }, [delay, duration, enabled, progress, reduceMotion]);

  return progress;
}

export function LevelMagicIcon({ level, size, variant = 'filled', color }: LevelMagicIconProps) {
  const config = LEVEL_BADGES[level];
  const isProgressCircle = variant === 'progressCircle';
  const accent = isProgressCircle ? COLORS.purple : color ?? config.color;
  const detailAccent = isProgressCircle ? config.secondaryColor : accent;
  const reduceMotion = useReducedMotion();
  const progress = useSoftLoop(true, 1500, level.length * 90, reduceMotion);
  const sparkleIcon = isProgressCircle ? config.progressAccent : config.hasAccentSparkle ? 'star' : undefined;
  const sparkleProgress = useSoftLoop(sparkleIcon !== undefined, 850, 500, reduceMotion);
  const runeProgress = useSoftLoop(config.hasRune === true, 1900, 420, reduceMotion);
  const auraProgress = useSoftLoop(isProgressCircle && config.progressAura === true, 2200, 660, reduceMotion);
  const animatedStyle = useMemo(() => {
    switch (config.animation) {
      case 'float':
        return {
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -1.5],
              }),
            },
          ],
        };
      case 'pulse':
        return {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }),
          transform: [
            {
              scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.04] }),
            },
          ],
        };
      case 'rune-shimmer':
        return {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }),
          transform: [
            {
              scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.02] }),
            },
          ],
        };
      case 'prestige':
        return {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
          transform: [
            {
              scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }),
            },
          ],
        };
      default:
        return {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }),
          transform: [
            {
              scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.02] }),
            },
          ],
        };
    }
  }, [config.animation, progress]);

  return (
    <View
      style={[
        styles.magicShell,
        {
          width: size,
          height: size,
          backgroundColor: variant === 'filled' ? config.background : 'transparent',
          borderColor: accent,
          borderWidth: variant === 'outline' ? 1 : 0,
        },
      ]}
    >
      {isProgressCircle && config.progressAura ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.progressAura,
            {
              width: size * 0.76,
              height: size * 0.76,
              borderRadius: size,
              backgroundColor: accent,
              opacity: auraProgress.interpolate({ inputRange: [0, 1], outputRange: [0.025, 0.08] }),
              transform: [{ scale: auraProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.06] }) }],
            },
          ]}
        />
      ) : null}
      {config.hasRune ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.runeGlow,
            {
              width: size * 0.66,
              height: size * 0.66,
              borderRadius: size,
              backgroundColor: detailAccent,
              opacity: runeProgress.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.15] }),
              transform: [{ scale: runeProgress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.1] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View style={animatedStyle}>
        {isProgressCircle && level === 'Novice' ? (
          <FontAwesome6 name="star" solid size={Math.max(14, Math.round(size * 0.56))} color={accent} />
        ) : (
          <FontAwesome6 name={config.icon} size={Math.max(14, Math.round(size * 0.56))} color={accent} />
        )}
      </Animated.View>
      {config.hasRune ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.runeSweep,
              {
                width: Math.max(3, Math.round(size * 0.1)),
                height: Math.max(12, Math.round(size * 0.42)),
                backgroundColor: '#FFFFFF',
                opacity: runeProgress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 0.28, 0] }),
                transform: [
                  { translateX: runeProgress.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.22, size * 0.22] }) },
                  { rotate: '24deg' },
                ],
              },
            ]}
          />
          <View style={[styles.runeMark, { left: size * 0.41, top: size * 0.38 }]} pointerEvents="none">
            <FontAwesome6 name="asterisk" size={Math.max(5, Math.round(size * 0.15))} color={detailAccent} />
          </View>
        </>
      ) : null}
      {sparkleIcon ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.magicAccent,
            {
              opacity: sparkleProgress.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.9] }),
              transform: [
                {
                  scale: sparkleProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
                },
              ],
            },
          ]}
        >
          <FontAwesome6 name={sparkleIcon} size={Math.max(6, Math.round(size * 0.2))} color={detailAccent} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function rankLabel(rank: number | null | undefined, level: CommunityLevel) {
  if (rank === 1) return 'First place';
  if (rank === 2) return 'Second place';
  if (rank === 3) return 'Third place';
  if (rank) return `Rank ${rank}, ${level}`;
  return `Unranked, ${level}`;
}

export function LeaderboardRankBadge({
  rank,
  level = 'Novice',
  size = 30,
  testID,
  accessibilityLabel,
  rankTextStyle,
}: LeaderboardRankBadgeProps) {
  const label = accessibilityLabel ?? rankLabel(rank, level);
  const isTopThree = rank === 1 || rank === 2 || rank === 3;
  const reduceMotion = useReducedMotion();
  const shineProgress = useSoftLoop(isTopThree, 1100, (rank ?? 0) * 180, reduceMotion);

  if (!isTopThree) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[styles.stack, { width: size }]}
      >
        <LevelMagicIcon level={level} size={size} />
        <Text style={[styles.rankText, { color: LEVEL_BADGES[level].color }, rankTextStyle]}>
          {rank ? `#${rank}` : '—'}
        </Text>
      </View>
    );
  }

  const medal = TOP_THREE[rank];
  const emblemSize = Math.max(15, Math.round(size * 0.58));
  const shineX = shineProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-size * 1.25, size * 1.25],
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[styles.stack, { width: size }]}
    >
      <View
        style={[
          styles.crest,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: medal.color,
            backgroundColor: medal.background,
            shadowColor: medal.color,
          },
        ]}
      >
        <Ionicons name="book-outline" size={emblemSize} color={medal.color} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.metallicShine,
            {
              width: Math.max(5, Math.round(size * 0.2)),
              height: size * 1.8,
              transform: [{ translateX: shineX }, { rotate: '25deg' }],
            },
          ]}
        />
      </View>
      <Text style={[styles.rankText, { color: medal.color }, rankTextStyle]}>#{rank}</Text>
    </View>
  );
}

/** Backward-compatible name for existing leaderboard imports. */
export function MiniLeaderboardCrest(props: LeaderboardRankBadgeProps) {
  return <LeaderboardRankBadge {...props} />;
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  crest: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    boxShadow: '0 2px 5px rgba(92, 86, 148, 0.16)',
    elevation: 2,
  },
  metallicShine: {
    position: 'absolute',
    top: -15,
    left: '42%',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  magicShell: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  runeGlow: {
    position: 'absolute',
  },
  progressAura: {
    position: 'absolute',
  },
  runeSweep: {
    position: 'absolute',
  },
  runeMark: {
    position: 'absolute',
  },
  magicAccent: {
    position: 'absolute',
    top: 1,
    right: 0,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
});
