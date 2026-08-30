import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import {
  COLORS,
  FLOATING_SHADOW,
  WORDWIZ_GRADIENT_COLORS,
} from '../../constants/theme';

const SURPRISE_LINES = [
  'Your learning streak paid off.',
  'A little vocabulary magic for you.',
  'That was a golden effort.',
  'A champion day of learning.',
];

function getSurpriseLine(celebrationId: string) {
  const hash = celebrationId.split('').reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  return SURPRISE_LINES[hash % SURPRISE_LINES.length];
}

export function GoldenTicketSurprise({
  celebrationId,
  ticketsAwarded,
  onFinished,
}: {
  celebrationId: string;
  ticketsAwarded: number;
  onFinished: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;
  const onFinishedRef = useRef(onFinished);
  const surpriseLine = useMemo(
    () => getSurpriseLine(celebrationId),
    [celebrationId],
  );

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    progress.setValue(0);
    sparkleProgress.setValue(0);
    let isActive = true;

    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.back(1.1)),
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
        Animated.delay(1750),
        Animated.timing(sparkleProgress, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished && isActive) onFinishedRef.current();
    });

    return () => {
      isActive = false;
      animation.stop();
    };
  }, [celebrationId, progress, sparkleProgress]);

  const cardOpacity = progress.interpolate({
    inputRange: [0, 0.14, 0.86, 1],
    outputRange: [0, 1, 1, 0],
  });
  const cardTranslateY = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [18, 0, -4],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0.94, 1, 0.99],
  });
  const sparkleOpacity = sparkleProgress.interpolate({
    inputRange: [0, 0.2, 0.78, 1],
    outputRange: [0, 1, 1, 0],
  });
  const sparkleLift = sparkleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, -9],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        surpriseStyles.container,
        {
          opacity: cardOpacity,
          transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
        },
      ]}
    >
      <Animated.View
        style={[
          surpriseStyles.sparkle,
          surpriseStyles.sparkleOne,
          { opacity: sparkleOpacity, transform: [{ translateY: sparkleLift }] },
        ]}
      >
        <Ionicons name="sparkles" size={17} color="#D39A16" />
      </Animated.View>
      <Animated.View
        style={[
          surpriseStyles.sparkle,
          surpriseStyles.sparkleTwo,
          {
            opacity: sparkleOpacity,
            transform: [{ translateY: sparkleLift }, { scale: 0.75 }],
          },
        ]}
      >
        <Ionicons name="star" size={13} color="#F0BE45" />
      </Animated.View>
      <View style={surpriseStyles.card}>
        <LinearGradient
          colors={WORDWIZ_GRADIENT_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={surpriseStyles.cardGradient}
        />
        <View style={surpriseStyles.ticketBadge}>
          <LinearGradient
            colors={['#B87910', '#F5D36E', '#C88A18']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="ticket" size={27} color={COLORS.white} />
          <Ionicons
            name="sparkles"
            size={10}
            color="#FFF2A7"
            style={surpriseStyles.badgeSparkle}
          />
        </View>
        <View style={surpriseStyles.copy}>
          <View style={surpriseStyles.brandRow}>
            <Ionicons name="sparkles" size={10} color="#C58B17" />
            <Text style={surpriseStyles.brandLabel}>
              <Text style={{ color: COLORS.purpleDark }}>W</Text>
              <Text style={{ color: COLORS.blue }}>o</Text>
              <Text style={{ color: COLORS.teal }}>r</Text>
              <Text style={{ color: COLORS.purple }}>d</Text>
              <Text style={{ color: COLORS.orange }}>W</Text>
              <Text style={{ color: COLORS.pink }}>i</Text>
              <Text style={{ color: COLORS.blue }}>z</Text>
              <Text style={{ color: COLORS.greenDark }}>a</Text>
              <Text style={{ color: COLORS.purpleDark }}>r</Text>
              <Text style={{ color: COLORS.orange }}>d</Text>
            </Text>
            <Text style={surpriseStyles.championLabel}>CHAMPION</Text>
          </View>
          <Text style={surpriseStyles.title}>Golden Ticket found!</Text>
          <Text numberOfLines={1} style={surpriseStyles.detail}>
            {surpriseLine} · +{ticketsAwarded} {ticketsAwarded === 1 ? 'ticket' : 'tickets'} added to your stash
          </Text>
        </View>
        <View style={surpriseStyles.checkBadge}>
          <Ionicons name="checkmark" size={16} color={COLORS.white} />
        </View>
      </View>
    </Animated.View>
  );
}

const surpriseStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 12,
  },
  card: {
    overflow: 'hidden',
    minHeight: 82,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FFFCF2',
    borderWidth: 1.5,
    borderColor: '#F1CF79',
    ...FLOATING_SHADOW,
  },
  cardGradient: {
    ...StyleSheet.absoluteFill,
    opacity: 0.48,
  },
  ticketBadge: {
    overflow: 'hidden',
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D49A25',
    borderWidth: 2,
    borderColor: '#F5D982',
  },
  badgeSparkle: {
    position: 'absolute',
    top: 3,
    right: 4,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  brandLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.15,
  },
  championLabel: {
    color: '#A97113',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    marginTop: 1,
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  detail: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.teal,
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
    top: 9,
    left: 37,
  },
});
