import { Ionicons } from '@expo/vector-icons';
import { Canvas, Group, Path, Skia, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';
import { MASTERY_LEVELS } from '../../utils';

const SIZE = 132;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const RING_INNER_RADIUS = RADIUS - STROKE_WIDTH / 2;
const RING_OUTER_RADIUS = RADIUS + STROKE_WIDTH / 2;
const CENTER_SIZE = RING_INNER_RADIUS * 2;
const SEGMENT_COLORS = MASTERY_LEVELS.map((level) => level.color);
const SEGMENT_SPARKLE_RADIUS = RADIUS + STROKE_WIDTH * 0.42;


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
  const ringPulse = useSharedValue(1);
  const centerScale = useSharedValue(1);
  const capBounce = useSharedValue(0);
  const sparkleBurst = useSharedValue(0);
  const completionTitleOpacity = useSharedValue(isComplete ? 1 : 0);
  const xpReward = useSharedValue(isComplete ? 1 : 0);

  const title = isComplete ? 'Lesson Complete!' : centerTitle;

  useEffect(() => {
    const previous = previousProgress.current;
    const previousMastery = previousMasteryScore.current;
    const previousCompletion = previousCompletionProgress.current;
    const didIncrease = safeProgress > previous || safeMasteryScore > previousMastery;
    const didComplete = isComplete && previousCompletion < 100;
    const shouldSparkle = Math.max(safeProgress, safeMasteryScore) >= 75;

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
      capBounce.value = withSequence(
        withSpring(-4, { damping: 9, stiffness: 260 }),
        withSpring(0, { damping: 11, stiffness: 210 }),
      );
      if (shouldSparkle) {
        sparkleBurst.value = withSequence(
          withTiming(1, { duration: 170 }),
          withTiming(0, { duration: 650 }),
        );
        setBurstKey((key) => key + 1);
      }
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
    isComplete,
    ringPulse,
    safeMasteryScore,
    safeCenterProgress,
    safeProgress,
    sparkleBurst,
    xpReward,
  ]);

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
        <Canvas pointerEvents="none" style={localStyles.ringCanvas}>
          <Group origin={vec(CENTER, CENTER)} transform={[{ rotate: -Math.PI / 2 }]}>
            {MASTERY_RING_SEGMENTS.map((segment) => (
              <SegmentArc
                key={segment.key}
                segment={segment}
                animatedScore={animatedMasteryScore}
              />
            ))}
          </Group>
          {MASTERY_BOUNDARY_LINES.map((line) => (
            <LevelBoundaryLine key={line.score} line={line} />
          ))}
        </Canvas>
      </Animated.View>

      <View pointerEvents="none" style={localStyles.effectsLayer}>
        {MASTERY_RING_SEGMENTS.map((segment, index) => (
          <SegmentSparkle
            key={`${segment.key}-sparkle`}
            segment={segment}
            size={index % 2 === 0 ? 4 : 3}
            animatedScore={animatedMasteryScore}
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
}: {
  segment: MasteryRingSegment;
  animatedScore: SharedValue<number>;
}) {
  const circlePath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(CENTER, CENTER, RADIUS);
    return path;
  }, []);
  const fillEnd = useDerivedValue(() => {
    const segmentProgress = getSegmentProgress(
      animatedScore.value,
      segment.startScore,
      segment.endScore,
    );
    return segment.startScore / 100 + ((segment.endScore - segment.startScore) / 100) * segmentProgress;
  });
  const glowOpacity = useDerivedValue(() => {
    const segmentProgress = getSegmentProgress(
      animatedScore.value,
      segment.startScore,
      segment.endScore,
    );
    if (segmentProgress < 0.5) return 0;
    if (segmentProgress < 0.75) return 0.1;
    return 0.18;
  });

  return (
    <>
      <Path
        path={circlePath}
        start={segment.startScore / 100}
        end={segment.endScore / 100}
        color="rgba(6,35,95,0.22)"
        style="stroke"
        strokeCap="butt"
        strokeWidth={STROKE_WIDTH}
      />
      <Path
        path={circlePath}
        start={segment.startScore / 100}
        end={fillEnd}
        color={segment.color}
        opacity={glowOpacity}
        style="stroke"
        strokeCap="butt"
        strokeWidth={STROKE_WIDTH + 3}
      />
      <Path
        path={circlePath}
        start={segment.startScore / 100}
        end={fillEnd}
        color={segment.color}
        style="stroke"
        strokeCap="butt"
        strokeWidth={STROKE_WIDTH}
      />
    </>
  );
}

function LevelBoundaryLine({
  line,
}: {
  line: (typeof MASTERY_BOUNDARY_LINES)[number];
}) {
  const boundaryPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(line.innerX, line.innerY);
    path.lineTo(line.outerX, line.outerY);
    return path;
  }, [line.innerX, line.innerY, line.outerX, line.outerY]);

  return (
    <Path
      path={boundaryPath}
      color="rgba(224,235,255,0.55)"
      style="stroke"
      strokeCap="butt"
      strokeWidth={1.25}
    />
  );
}

function SegmentSparkle({
  segment,
  size,
  animatedScore,
  burst,
}: {
  segment: MasteryRingSegment;
  size: number;
  animatedScore: SharedValue<number>;
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
    const sparkleProgress = clampUnit((segmentProgress - 0.95) / 0.05);

    return {
      opacity: sparkleProgress * burst.value * 0.82,
      transform: [
        { translateY: -burst.value * 3 },
        { scale: 0.72 + burst.value * 0.5 },
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
  ringCanvas: {
    height: SIZE,
    width: SIZE,
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
    shadowColor: COLORS.purple,
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
