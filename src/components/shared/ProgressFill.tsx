import {
  Canvas,
  Circle,
  LinearGradient as SkiaLinearGradient,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type ProgressVariant = 'standard' | 'main' | 'hero';

// A shared cap makes bursts feel special and prevents a long list from creating
// dozens of particle animations after one quiz result.
let activeSparkleBursts = 0;
const MAX_ACTIVE_SPARKLE_BURSTS = 2;

function reserveSparkleBurst() {
  if (activeSparkleBursts >= MAX_ACTIVE_SPARKLE_BURSTS) return false;
  activeSparkleBursts += 1;
  return true;
}

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

function clampProgress(progress: number) {
  return Math.max(0, Math.min(100, progress));
}

export function ProgressFill({
  progress,
  color,
  radius,
  style,
  variant = 'standard',
}: {
  progress: number;
  color: string;
  radius: number;
  style?: StyleProp<ViewStyle>;
  variant?: ProgressVariant;
}) {
  const safeProgress = clampProgress(progress);
  const previousProgress = useRef(safeProgress);
  const isFirstRender = useRef(true);
  const sparkleReserved = useRef(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const fillScale = useSharedValue(1);
  const updatePulse = useSharedValue(0);
  const highlightTravel = useSharedValue(0);
  const heroSweep = useSharedValue(0);
  const heroSweepOpacity = useSharedValue(0);
  const sparkleOpacity = useSharedValue(0);
  const sparkleTravel = useSharedValue(0);

  const releaseSparkleBurst = useCallback(() => {
    if (!sparkleReserved.current) return;
    sparkleReserved.current = false;
    activeSparkleBursts = Math.max(0, activeSparkleBursts - 1);
  }, []);

  useEffect(() => {
    const previous = previousProgress.current;
    const didIncrease = !isFirstRender.current && safeProgress > previous;
    const justMastered = previous < 100 && safeProgress >= 100;

    if (didIncrease) {
      // The parent controls the final width. Scaling from the previous ratio
      // gives the fill a native-thread 600ms transition without animating every bar on mount.
      fillScale.value = Math.max(0.04, Math.min(1, previous / Math.max(safeProgress, 1)));
      fillScale.value = withTiming(1, {
        duration: 600,
        easing: Easing.out(Easing.cubic),
      });
      updatePulse.value = withSequence(
        withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 860, easing: Easing.out(Easing.cubic) }),
      );
      if (variant === 'main') {
        highlightTravel.value = 0;
        highlightTravel.value = withTiming(1, {
          duration: 900,
          easing: Easing.out(Easing.cubic),
        });
      }
      if (variant === 'hero') {
        heroSweep.value = 0;
        heroSweepOpacity.value = 0;
        heroSweep.value = withDelay(90, withTiming(1, {
          duration: 820,
          easing: Easing.out(Easing.cubic),
        }));
        heroSweepOpacity.value = withDelay(
          90,
          withSequence(
            withTiming(0.9, { duration: 130, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 690, easing: Easing.in(Easing.quad) }),
          ),
        );
      }

      const crossedMilestone = [25, 50, 75, 100].some(
        (milestone) => previous < milestone && safeProgress >= milestone,
      );
      const shouldBurst = crossedMilestone || (safeProgress >= 75 && (safeProgress < 100 || justMastered));
      if (shouldBurst && reserveSparkleBurst()) {
        sparkleReserved.current = true;
        sparkleOpacity.value = 0;
        sparkleTravel.value = 0;
        sparkleTravel.value = withTiming(1, {
          duration: 680,
          easing: Easing.out(Easing.cubic),
        });
        sparkleOpacity.value = withSequence(
          withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 550, easing: Easing.in(Easing.quad) }, (finished) => {
            if (finished) runOnJS(releaseSparkleBurst)();
          }),
        );
      }
    }

    previousProgress.current = safeProgress;
    isFirstRender.current = false;
  }, [fillScale, heroSweep, heroSweepOpacity, highlightTravel, releaseSparkleBurst, safeProgress, sparkleOpacity, sparkleTravel, updatePulse, variant]);

  useEffect(
    () => () => {
      cancelAnimation(fillScale);
      cancelAnimation(updatePulse);
      cancelAnimation(highlightTravel);
      cancelAnimation(heroSweep);
      cancelAnimation(heroSweepOpacity);
      cancelAnimation(sparkleOpacity);
      cancelAnimation(sparkleTravel);
      releaseSparkleBurst();
    },
    [fillScale, heroSweep, heroSweepOpacity, highlightTravel, releaseSparkleBurst, sparkleOpacity, sparkleTravel, updatePulse],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);

  const fillAnimationStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fillScale.value }],
  }));

  const sparkleOneX = useDerivedValue(
    () => Math.max(3, layout.width - 4 - sparkleTravel.value * 7),
    [layout.width],
  );
  const sparkleOneY = useDerivedValue(
    () => layout.height * (0.48 - sparkleTravel.value * 0.62),
    [layout.height],
  );
  const sparkleTwoX = useDerivedValue(
    () => Math.max(3, layout.width - 7 + sparkleTravel.value * 4),
    [layout.width],
  );
  const sparkleTwoY = useDerivedValue(
    () => layout.height * (0.52 + sparkleTravel.value * 0.55),
    [layout.height],
  );
  const sparkleRadius = useDerivedValue(
    () => 1.4 + sparkleTravel.value * 1.4,
  );
  const mainHighlightX = useDerivedValue(
    () => (layout.width + Math.max(6, layout.height)) * highlightTravel.value - Math.max(6, layout.height),
    [layout.height, layout.width],
  );
  const heroSweepX = useDerivedValue(
    () => Math.max(0, layout.width * heroSweep.value - Math.max(4, layout.height * 0.24)),
    [layout.height, layout.width],
  );

  const isBuilding = safeProgress >= 25;
  const isStrong = safeProgress >= 50;
  const isCloseToMastery = safeProgress >= 75 && safeProgress < 100;
  const isMastered = safeProgress >= 100;
  const isHero = variant === 'hero';
  // Keep the earned states visibly rich without putting a translucent white
  // layer over the bar. The light is contained inside the fill, so it reads
  // as coloured depth rather than the washed-out fog seen previously.
  const topRailColor = mixHexColors(
    color,
    isCloseToMastery || isMastered ? '#FFD76A' : '#FFFFFF',
    isCloseToMastery || isMastered ? 0.3 : 0.2,
  );
  const warmHighlight = mixHexColors(color, '#FFE18A', isCloseToMastery || isMastered ? 0.5 : 0.16);
  const fillColors = [
    mixHexColors(
      color,
      isHero ? '#C4FFF0' : '#FFFFFF',
      isHero ? 0.26 : isCloseToMastery || isMastered ? 0.22 : isStrong ? 0.15 : isBuilding ? 0.1 : 0.04,
    ),
    color,
    mixHexColors(color, '#15264C', isStrong ? 0.16 : 0.08),
  ];
  const cornerRadius = Math.min(radius, layout.height / 2);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[styles.container, { transformOrigin: 'left center' }, style, fillAnimationStyle]}
    >
      {layout.width > 0 && layout.height > 0 ? (
        <Canvas pointerEvents="none" style={styles.canvas}>
          <RoundedRect
            x={0}
            y={0}
            width={layout.width}
            height={layout.height}
            r={cornerRadius}
            color={color}
          >
            {isBuilding ? (
              <SkiaLinearGradient
                start={vec(0, 0)}
                end={vec(0, layout.height)}
                colors={fillColors}
                positions={[0, 0.5, 1]}
              />
            ) : null}
          </RoundedRect>

          {isStrong ? (
            <RoundedRect
              x={Math.max(1, layout.height * 0.08)}
              y={Math.max(1, layout.height * 0.1)}
              width={Math.max(1, layout.width - layout.height * 0.16)}
              height={Math.max(1.6, layout.height * (isCloseToMastery || isMastered ? 0.28 : 0.22))}
              r={Math.max(1, cornerRadius * 0.5)}
              color={topRailColor}
              opacity={isCloseToMastery || isMastered ? 0.72 : 0.42}
            />
          ) : null}

          {variant === 'main' ? (
            <RoundedRect
              x={mainHighlightX}
              y={1}
              width={Math.max(3, layout.height * 0.28)}
              height={Math.max(1, layout.height - 2)}
              r={cornerRadius}
              color="#FFE7A1"
              opacity={updatePulse}
            />
          ) : null}

          {isHero ? (
            <>
              <RoundedRect
                x={heroSweepX}
                y={1}
                width={Math.max(4, layout.height * 0.3)}
                height={Math.max(1, layout.height - 2)}
                r={cornerRadius}
                color="#FFE8A4"
                opacity={heroSweepOpacity}
              />
            </>
          ) : null}

          <Circle
            cx={sparkleOneX}
            cy={sparkleOneY}
            r={sparkleRadius}
            color="#FFF0A8"
            opacity={sparkleOpacity}
          />
          <Circle
            cx={sparkleTwoX}
            cy={sparkleTwoY}
            r={sparkleRadius}
            color={warmHighlight}
            opacity={sparkleOpacity}
          />
        </Canvas>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    overflow: 'visible',
    position: 'relative',
  },
  canvas: {
    height: '100%',
    width: '100%',
  },
});
