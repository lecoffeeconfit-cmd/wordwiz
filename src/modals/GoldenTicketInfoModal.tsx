import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS } from '../constants/theme';
import { AdmitOneTicket } from '../components';

export function GoldenTicketInfoModal({
  visible,
  refreshTokens,
  onClose,
}: {
  visible: boolean;
  refreshTokens: number;
  onClose: () => void;
}) {
  const backdropProgress = useRef(new Animated.Value(0)).current;
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const ticketScale = useRef(new Animated.Value(0.72)).current;
  const sparkleProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    backdropProgress.setValue(0);
    sheetProgress.setValue(0);
    ticketScale.setValue(0.72);
    sparkleProgress.setValue(0);

    const animation = Animated.parallel([
      Animated.timing(backdropProgress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(sheetProgress, {
        toValue: 1,
        friction: 8,
        tension: 72,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(110),
        Animated.spring(ticketScale, {
          toValue: 1,
          friction: 5,
          tension: 90,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(sparkleProgress, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start();
    return () => animation.stop();
  }, [backdropProgress, sheetProgress, sparkleProgress, ticketScale, visible]);

  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [52, 0],
  });
  const sparkleTranslateY = sparkleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={modalStyles.backdrop}>
        <Animated.View
          pointerEvents="none"
          style={[modalStyles.backdropTint, { opacity: backdropProgress }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Golden Ticket details"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          accessibilityViewIsModal
          style={[
            modalStyles.sheet,
            {
              opacity: backdropProgress,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <View style={modalStyles.headerCopy}>
              <Text style={modalStyles.eyebrow}>A LITTLE LEARNING MAGIC</Text>
              <Text style={modalStyles.title}>Golden Ticket</Text>
              <Text style={modalStyles.subtitle}>
                Your Magic Pass to one more moment of practice.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Golden Ticket details"
              onPress={onClose}
              style={({ pressed }) => [modalStyles.closeButton, pressed && modalStyles.pressed]}
            >
              <Ionicons name="close" size={20} color={COLORS.ink} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={modalStyles.content}
          >
            <View style={modalStyles.ticketHero}>
              <Animated.View
                style={[
                  modalStyles.ticketGlow,
                  { opacity: sparkleProgress, transform: [{ scale: ticketScale }] },
                ]}
              />
              <Animated.View
                style={[modalStyles.ticketIcon, { transform: [{ scale: ticketScale }] }]}
              >
                <AdmitOneTicket size="large" />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  modalStyles.sparkleTop,
                  { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
                ]}
              >
                <Ionicons name="sparkles" size={21} color="#D39A16" />
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  modalStyles.sparkleSide,
                  { opacity: sparkleProgress, transform: [{ translateY: sparkleTranslateY }] },
                ]}
              >
                <Ionicons name="star" size={13} color="#E5AE29" />
              </Animated.View>
              <View style={modalStyles.ticketHeroCopy}>
                <Text style={modalStyles.ticketCount}>
                  {refreshTokens} {refreshTokens === 1 ? 'ticket' : 'tickets'} ready
                </Text>
                <Text style={modalStyles.ticketHeroText}>
                  Spend one when you want a fresh chance to practice.
                </Text>
              </View>
            </View>

            <Text style={modalStyles.sectionLabel}>WHAT THEY CAN DO</Text>
            <InfoRow
              icon="refresh-circle-outline"
              color={COLORS.blue}
              title="Retry today’s Daily Quiz"
              text="Take one more Daily Quiz after you finish your first attempt and work toward a better score."
            />
            <InfoRow
              icon="flame-outline"
              color={COLORS.orange}
              title="Unlock an Omega Test early"
              text="Skip the seven-day wait and take the final-boss assessment. Your regular weekly unlock time stays the same."
            />

            <View style={modalStyles.earnCard}>
              <View style={modalStyles.earnIcon}>
                <Ionicons name="trophy-outline" size={21} color={COLORS.purpleDark} />
              </View>
              <View style={modalStyles.earnCopy}>
                <Text style={modalStyles.sectionLabel}>HOW TO GET THEM</Text>
                <Text style={modalStyles.earnTitle}>Keep learning to find them</Text>
                <Text style={modalStyles.earnText}>
                  Save words, review cards, take quizzes, and finish games. Every achievement milestone and sustained learning can add a surprise Golden Ticket to your stash.
                </Text>
              </View>
            </View>

            <View style={modalStyles.note}>
              <Ionicons name="bulb-outline" size={17} color="#A87710" />
              <Text style={modalStyles.noteText}>
                Tickets are used only when you confirm a refresh, so your regular learning progress stays safe.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Golden Ticket details"
              onPress={onClose}
              style={({ pressed }) => [modalStyles.doneButton, pressed && modalStyles.pressed]}
            >
              <Text style={modalStyles.doneButtonText}>GOT IT</Text>
              <Ionicons name="sparkles" size={17} color={COLORS.white} />
            </Pressable>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function InfoRow({
  icon,
  color,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <View style={modalStyles.infoRow}>
      <View style={[modalStyles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View style={modalStyles.infoCopy}>
        <Text style={modalStyles.infoTitle}>{title}</Text>
        <Text style={modalStyles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(31, 39, 71, 0.48)',
  },
  sheet: {
    maxHeight: '92%',
    paddingHorizontal: 18,
    paddingBottom: 25,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FFFCFF',
    shadowColor: '#18254A',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.18,
    shadowRadius: 25,
    elevation: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    marginTop: 10,
    marginBottom: 14,
    borderRadius: 3,
    backgroundColor: '#DCD6EA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#B38216',
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: '900',
  },
  title: {
    marginTop: 3,
    color: COLORS.ink,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.65,
    fontWeight: '900',
  },
  subtitle: {
    maxWidth: 270,
    marginTop: 5,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  content: {
    paddingTop: 17,
    paddingBottom: 6,
  },
  ticketHero: {
    position: 'relative',
    minHeight: 104,
    padding: 15,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#FFF5D3',
    borderWidth: 1,
    borderColor: '#F3D77A',
  },
  ticketGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    right: -42,
    top: -59,
    borderRadius: 85,
    backgroundColor: '#FFE39A',
  },
  ticketIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D4A020',
    shadowColor: '#B77D08',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 6,
  },
  sparkleTop: {
    position: 'absolute',
    top: 10,
    right: 28,
  },
  sparkleSide: {
    position: 'absolute',
    right: 12,
    bottom: 13,
  },
  ticketHeroCopy: {
    flex: 1,
  },
  ticketCount: {
    color: '#7D5B00',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  ticketHeroText: {
    maxWidth: 200,
    marginTop: 4,
    color: '#9A781D',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    marginTop: 17,
    marginBottom: 8,
    color: COLORS.purpleDark,
    fontSize: 9,
    letterSpacing: 0.9,
    fontWeight: '900',
  },
  infoRow: {
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: COLORS.white,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  infoText: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  earnCard: {
    marginTop: 8,
    padding: 13,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: COLORS.purplePale,
  },
  earnIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  earnCopy: {
    flex: 1,
  },
  earnTitle: {
    marginTop: 2,
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  earnText: {
    marginTop: 4,
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  note: {
    marginTop: 11,
    paddingHorizontal: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  noteText: {
    flex: 1,
    color: '#9A781D',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  doneButton: {
    minHeight: 49,
    marginTop: 17,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.purpleDark,
    shadowColor: COLORS.purpleDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  doneButtonText: {
    color: COLORS.white,
    fontSize: 13,
    letterSpacing: 0.7,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
  },
});
