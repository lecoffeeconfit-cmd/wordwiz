import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { COLORS } from '../../constants/theme';
import { MASTERY_LEVELS } from '../../utils';

const SIZE = 132;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;
const RING_INNER_RADIUS = RADIUS - STROKE_WIDTH / 2;
const RING_OUTER_RADIUS = RADIUS + STROKE_WIDTH / 2;
const CENTER_SIZE = RING_INNER_RADIUS * 2;
const SEGMENT_COLORS = MASTERY_LEVELS.map((level) => level.color);
const SEGMENT_SPARKLE_RADIUS = RADIUS + STROKE_WIDTH * 0.42;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type LessonProgressRingProps = {
  progress: number;
  lessonTitle: string;
  masteryScore?: number;
};

type MasteryRingSegment = {
  key: string;
  color: string;
  startScore: number;
  endScore: number;
  startLength: number;
  arcLength: number;
  startDegrees: number;
  sweepDegrees: number;
  sparkleRatio: number;
};

const MASTERY_RING_SEGMENTS: MasteryRingSegment[] = MASTERY_LEVELS.map(
  (level, index) => {
    const nextLevel = MASTERY_LEVELS[index + 1];
    const startScore = level.minScore;
    const endScore = nextLevel?.minScore ?? 100;
    const scoreSpan = endScore - startScore;

    return {
      key: level.shortTitle,
      color: level.color,
      startScore,
      endScore,
      startLength: CIRCUMFERENCE * (startScore / 100),
      arcLength: CIRCUMFERENCE * (scoreSpan / 100),
      startDegrees: startScore * 3.6,
      sweepDegrees: scoreSpan * 3.6,
      sparkleRatio: index % 2 === 0 ? 0.66 : 0.42,
    };
  },
);

const MASTERY_BOUNDARY_LINES = [
  ...MASTERY_LEVELS.slice(1).map((level) => level.minScore),
  100,
].map((score) => {
  const radians = ((score / 100) * 360 - 90) * (Math.PI / 180);

  return {
    score,
    innerX: CENTER + Math.cos(radians) * (RING_INNER_RADIUS - 0.5),
    innerY: CENTER + Math.sin(radians) * (RING_INNER_RADIUS - 0.5),
    outerX: CENTER + Math.cos(radians) * (RING_OUTER_RADIUS + 0.5),
    outerY: CENTER + Math.sin(radians) * (RING_OUTER_RADIUS + 0.5),
  };
});

const CONFETTI = [
  { angle: -38, color: SEGMENT_COLORS[3], distance: 42, delay: 0 },
  { angle: -8, color: SEGMENT_COLORS[6], distance: 35, delay: 40 },
  { angle: 27, color: SEGMENT_COLORS[1], distance: 44, delay: 90 },
  { angle: 68, color: SEGMENT_COLORS[5], distance: 39, delay: 20 },
  { angle: 112, color: SEGMENT_COLORS[2], distance: 43, delay: 120 },
  { angle: 154, color: SEGMENT_COLORS[4], distance: 36, delay: 80 },
  { angle: 205, color: SEGMENT_COLORS[3], distance: 40, delay: 130 },
  { angle: 246, color: SEGMENT_COLORS[0], distance: 35, delay: 30 },
  { angle: 291, color: SEGMENT_COLORS[6], distance: 42, delay: 100 },
  { angle: 334, color: SEGMENT_COLORS[1], distance: 38, delay: 70 },
];

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function triggerProgressHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

function triggerCompleteHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}

export function LessonProgressRing({
  progress,
  lessonTitle,
  masteryScore,
}: LessonProgressRingProps) {
  const safeProgress = clampProgress(progress);
  const safeMasteryScore = clampProgress(masteryScore ?? progress);
  const safeCenterProgress = masteryScore === undefined ? safeProgress : safeMasteryScore;
  const centerTitle = masteryScore === undefined ? lessonTitle : 'TOTAL LEARNING\nPROGRESS';
  const previousProgress = useRef(safeProgress);
  const previousMasteryScore = useRef(safeMasteryScore);
  const completionProgress = masteryScore === undefined ? safeProgress : safeMasteryScore;
  const isComplete = completionProgress >= 100;
  const previousCompletionProgress = useRef(completionProgress);
  const [displayProgress, setDisplayProgress] = useState(safeCenterProgress);
  const [burstKey, setBurstKey] = useState(0);
  const animatedMasteryScore = useSharedValue(safeMasteryScore);
  const displayedProgressValue = useSharedValue(safeCenterProgress);
  const glowPulse = useSharedValue(0);
  const ringPulse = useSharedValue(1);
  const centerScale = useSharedValue(1);
  const capBounce = useSharedValue(0);
  const sparkleBurst = useSharedValue(0);
  const shimmerTravel = useSharedValue(0);
  const completionTitleOpacity = useSharedValue(isComplete ? 1 : 0);
  const xpReward = useSharedValue(isComplete ? 1 : 0);

  const title = isComplete ? 'Lesson Complete!' : centerTitle;

  useEffect(() => {
    const previous = previousProgress.current;
    const previousMastery = previousMasteryScore.current;
    const previousCompletion = previousCompletionProgress.current;
    const didIncrease = safeProgress > previous || safeMasteryScore > previousMastery;
    const didComplete = isComplete && previousCompletion < 100;

    animatedMasteryScore.value = withTiming(safeMasteryScore, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
    displayedProgressValue.value = withTiming(safeCenterProgress, {
      duration: 820,
      easing: Easing.out(Easing.cubic),
    });

    if (didIncrease) {
      triggerProgressHaptic();
      ringPulse.value = withSequence(
        withSpring(1.035, { damping: 12, stiffness: 210 }),
        withSpring(1, { damping: 13, stiffness: 180 }),
      );
      glowPulse.value = withSequence(
        withTiming(1, { duration: 190 }),
        withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }),
      );
      capBounce.value = withSequence(
        withSpring(-4, { damping: 9, stiffness: 260 }),
        withSpring(0, { damping: 11, stiffness: 210 }),
      );
      sparkleBurst.value = withSequence(
        withTiming(1, { duration: 170 }),
        withTiming(0, { duration: 650 }),
      );
      setBurstKey((key) => key + 1);
    }

    if (didComplete) {
      triggerCompleteHaptic();
      centerScale.value = withSequence(
        withSpring(1.05, { damping: 10, stiffness: 180 }),
        withSpring(1, { damping: 11, stiffness: 170 }),
      );
      ringPulse.value = withSequence(
        withSpring(1.06, { damping: 10, stiffness: 190 }),
        withSpring(1, { damping: 12, stiffness: 170 }),
      );
      glowPulse.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0, { duration: 900, easing: Easing.out(Easing.cubic) }),
      );
      completionTitleOpacity.value = withTiming(1, { duration: 360 });
      xpReward.value = withSequence(
        withDelay(380, withTiming(1, { duration: 260 })),
        withDelay(900, withTiming(0, { duration: 420 })),
      );
      setBurstKey((key) => key + 1);
    } else if (!isComplete) {
      completionTitleOpacity.value = withTiming(0, { duration: 180 });
      xpReward.value = withTiming(0, { duration: 140 });
    }

    previousProgress.current = safeProgress;
    previousMasteryScore.current = safeMasteryScore;
    previousCompletionProgress.current = completionProgress;
  }, [
    animatedMasteryScore,
    capBounce,
    centerScale,
    completionTitleOpacity,
    completionProgress,
    displayedProgressValue,
    glowPulse,
    isComplete,
    ringPulse,
    safeMasteryScore,
    safeCenterProgress,
    safeProgress,
    sparkleBurst,
    xpReward,
  ]);

  useEffect(() => {
    shimmerTravel.value = withRepeat(
      withTiming(1, {
        duration: 2500,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [shimmerTravel]);

  useAnimatedReaction(
    () => Math.round(displayedProgressValue.value),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayProgress)(current);
      }
    },
  );

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringPulse.value }],
  }));

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerScale.value }],
    boxShadow: `0 15px 32px rgba(32, 51, 109, 0.18), 0 0 22px rgba(255, 255, 255, ${
      0.36 + glowPulse.value * 0.18
    })`,
  }));

  const capStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: capBounce.value }],
  }));

  const completionTitleStyle = useAnimatedStyle(() => ({
    opacity: completionTitleOpacity.value,
    transform: [{ translateY: interpolate(completionTitleOpacity.value, [0, 1], [3, 0]) }],
  }));

  const xpRewardStyle = useAnimatedStyle(() => ({
    opacity: xpReward.value,
    transform: [
      { translateY: interpolate(xpReward.value, [0, 1], [8, -2]) },
      { scale: interpolate(xpReward.value, [0, 1], [0.88, 1]) },
    ],
  }));

  return (
    <View style={localStyles.container}>
      <Animated.View style={[localStyles.ringShell, pulseStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {MASTERY_RING_SEGMENTS.map((segment) => (
            <SegmentArc
              key={segment.key}
              segment={segment}
              animatedScore={animatedMasteryScore}
              shimmerTravel={shimmerTravel}
            />
          ))}
          {MASTERY_BOUNDARY_LINES.map((line) => (
            <LevelBoundaryLine key={line.score} line={line} />
          ))}
        </Svg>
      </Animated.View>

      <View pointerEvents="none" style={localStyles.effectsLayer}>
        {MASTERY_RING_SEGMENTS.map((segment, index) => (
          <SegmentSparkle
            key={`${segment.key}-sparkle`}
            segment={segment}
            size={index % 2 === 0 ? 4 : 3}
            phase={index * 0.13}
            animatedScore={animatedMasteryScore}
            shimmerTravel={shimmerTravel}
            burst={sparkleBurst}
          />
        ))}
        {CONFETTI.map((piece) => (
          <ConfettiPiece
            key={`${piece.angle}-${piece.color}`}
            {...piece}
            burstKey={burstKey}
          />
        ))}
      </View>

      <Animated.View style={[localStyles.centerCard, centerStyle]}>
        <Animated.View style={capStyle}>
          <Ionicons name="school" size={31} color={COLORS.purpleDark} />
        </Animated.View>
        <Text style={localStyles.percentText}>{displayProgress}%</Text>
        <Animated.Text
          numberOfLines={2}
          adjustsFontSizeToFit
          style={[
            localStyles.lessonTitle,
            isComplete && completionTitleStyle,
          ]}
        >
          {title}
        </Animated.Text>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[localStyles.xpReward, xpRewardStyle]}>
        <Ionicons name="flash" size={10} color={COLORS.yellow} />
        <Text style={localStyles.xpRewardText}>+25 XP</Text>
      </Animated.View>
    </View>
  );
}

function ConfettiPiece({
  angle,
  color,
  distance,
  delay,
  burstKey,
}: {
  angle: number;
  color: string;
  distance: number;
  delay: number;
  burstKey: number;
}) {
  const burst = useSharedValue(0);

  useEffect(() => {
    if (burstKey === 0) {
      return;
    }

    burst.value = 0;
    burst.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 310, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 420, easing: Easing.in(Easing.cubic) }),
      ),
    );
  }, [burst, burstKey, delay]);

  const radians = (angle * Math.PI) / 180;
  const confettiStyle = useAnimatedStyle(() => ({
    opacity: burst.value,
    transform: [
      { translateX: Math.cos(radians) * distance * burst.value },
      { translateY: Math.sin(radians) * distance * burst.value },
      { rotate: `${angle + burst.value * 160}deg` },
      { scale: interpolate(burst.value, [0, 0.35, 1], [0.4, 1, 0.72]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        localStyles.confetti,
        {
          backgroundColor: color,
          left: CENTER - 3,
          top: CENTER - 3,
        },
        confettiStyle,
      ]}
    />
  );
}

function SegmentArc({
  segment,
  animatedScore,
  shimmerTravel,
}: {
  segment: MasteryRingSegment;
  animatedScore: SharedValue<number>;
  shimmerTravel: SharedValue<number>;
}) {
  const trackDasharray = `${segment.arcLength} ${CIRCUMFERENCE - segment.arcLength}`;
  const strokeDashoffset = -segment.startLength;
  const rotateToTop = `rotate(-90 ${CENTER} ${CENTER})`;

  const fillAnimatedProps = useAnimatedProps(() => {
    const segmentProgress = getSegmentProgress(
      animatedScore.value,
      segment.startScore,
      segment.endScore,
    );
    const fillLength = Math.max(0.01, segment.arcLength * segmentProgress);

    return {
      opacity: segmentProgress > 0.002 ? 1 : 0,
      strokeDasharray: `${fillLength} ${CIRCUMFERENCE - fillLength}`,
    };
  });

  const shineAnimatedProps = useAnimatedProps(() => {
    const segmentProgress = getSegmentProgress(
      animatedScore.value,
      segment.startScore,
      segment.endScore,
    );
    const shineProgress = clampUnit((segmentProgress - 0.48) / 0.22);
    const glowProgress = clampUnit((segmentProgress - 0.75) / 0.25);
    const visibleLength = Math.max(0.01, segment.arcLength * segmentProgress);
    const shineLength = Math.max(10, Math.min(23, segment.arcLength * 0.36));
    const travelLength = Math.max(0, visibleLength - shineLength);
    const localOffset = travelLength * shimmerTravel.value;

    return {
      opacity: shineProgress * (0.2 + glowProgress * 0.14),
      strokeDasharray: `${shineLength} ${CIRCUMFERENCE - shineLength}`,
      strokeDashoffset: -(segment.startLength + localOffset),
    };
  });

  return (
    <>
      <Circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        stroke="rgba(6,35,95,0.22)"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="butt"
        fill="transparent"
        strokeDasharray={trackDasharray}
        strokeDashoffset={strokeDashoffset}
        transform={rotateToTop}
      />
      <AnimatedCircle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        stroke={segment.color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="butt"
        fill="transparent"
        strokeDashoffset={strokeDashoffset}
        animatedProps={fillAnimatedProps}
        transform={rotateToTop}
      />
      <AnimatedCircle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        stroke={segment.color}
        strokeWidth={4}
        strokeLinecap="round"
        fill="transparent"
        animatedProps={shineAnimatedProps}
        transform={rotateToTop}
      />
    </>
  );
}

function LevelBoundaryLine({
  line,
}: {
  line: (typeof MASTERY_BOUNDARY_LINES)[number];
}) {
  return (
    <Line
      x1={line.innerX}
      y1={line.innerY}
      x2={line.outerX}
      y2={line.outerY}
      stroke="rgba(255,255,255,0.42)"
      strokeWidth={1.25}
      strokeLinecap="butt"
    />
  );
}

function SegmentSparkle({
  segment,
  size,
  phase,
  animatedScore,
  shimmerTravel,
  burst,
}: {
  segment: MasteryRingSegment;
  size: number;
  phase: number;
  animatedScore: SharedValue<number>;
  shimmerTravel: SharedValue<number>;
  burst: SharedValue<number>;
}) {
  const sparkleAngle = segment.startDegrees + segment.sweepDegrees * segment.sparkleRatio;
  const radians = ((sparkleAngle - 90) * Math.PI) / 180;
  const x = CENTER + Math.cos(radians) * SEGMENT_SPARKLE_RADIUS - size / 2;
  const y = CENTER + Math.sin(radians) * SEGMENT_SPARKLE_RADIUS - size / 2;

  const sparkleStyle = useAnimatedStyle(() => {
    const segmentProgress = getSegmentProgress(
      animatedScore.value,
      segment.startScore,
      segment.endScore,
    );
    const shineProgress = clampUnit((segmentProgress - 0.48) / 0.22);
    const glowProgress = clampUnit((segmentProgress - 0.75) / 0.25);
    const twinkle =
      0.55 + Math.sin((shimmerTravel.value + phase) * Math.PI * 2) * 0.28;
    const orbit = shimmerTravel.value * Math.PI * 2 + phase;

    return {
      opacity: Math.max(
        0,
        glowProgress * (0.42 + shineProgress * 0.1) * twinkle + burst.value * 0.32,
      ),
      transform: [
        { translateX: Math.cos(orbit) * 1.6 },
        { translateY: Math.sin(orbit) * 1.6 },
        { scale: 0.72 + glowProgress * 0.46 + burst.value * 0.24 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        localStyles.sparkle,
        {
          left: x,
          top: y,
          width: size,
          height: size,
          backgroundColor: segment.color,
          borderRadius: size / 2,
          shadowColor: segment.color,
        },
        sparkleStyle,
      ]}
    />
  );
}

function getSegmentProgress(score: number, startScore: number, endScore: number) {
  'worklet';

  if (score >= endScore) {
    return 1;
  }

  if (score <= startScore) {
    return 0;
  }

  return (score - startScore) / (endScore - startScore);
}

function clampUnit(value: number) {
  'worklet';

  return Math.max(0, Math.min(1, value));
}

const localStyles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringShell: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  effectsLayer: {
    ...StyleSheet.absoluteFill,
  },
  centerCard: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: COLORS.white,
    shadowColor: '#20336D',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 8,
  },
  percentText: {
    marginTop: 2,
    color: COLORS.ink,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900',
  },
  lessonTitle: {
    maxWidth: 86,
    marginTop: 1,
    color: COLORS.muted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sparkle: {
    position: 'absolute',
    shadowColor: COLORS.white,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 3,
  },
  confetti: {
    position: 'absolute',
    width: 6,
    height: 3,
    borderRadius: 2,
  },
  xpReward: {
    position: 'absolute',
    right: 3,
    top: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(31,39,71,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
  },
  xpRewardText: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: '900',
  },
});
