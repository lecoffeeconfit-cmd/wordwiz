import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { Word } from '../types';

export function DeleteWordModal({
  word,
  onClose,
  onConfirm,
}: {
  word: Word | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={word !== null}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep word"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.iconCircle}>
            <Ionicons name="trash-outline" size={25} color="#E85B7E" />
          </View>
          <Text style={styles.eyebrow}>REMOVE FROM YOUR LIBRARY</Text>
          <Text style={styles.title}>Delete this word?</Text>
          <View style={styles.wordPill}>
            <Text numberOfLines={1} style={styles.wordPillText}>{word?.term}</Text>
          </View>
          <Text style={styles.body}>
            This removes the word, its review history, and quiz evidence from your WordWiz library. You can add it again later, but this learning data cannot be restored.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.keepButton, pressed && styles.pressed]}
            >
              <Text style={styles.keepButtonText}>Keep word</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Permanently removes this word and its learning history."
              onPress={onConfirm}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
            >
              <Ionicons name="trash" size={15} color={COLORS.white} />
              <Text style={styles.deleteButtonText}>Delete word</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(17, 27, 61, 0.42)',
  },
  sheet: {
    alignItems: 'center',
    padding: 22,
    borderWidth: 1,
    borderColor: '#F2D4DF',
    borderRadius: 28,
    backgroundColor: '#FFFDFE',
    shadowColor: '#18254A',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 26,
    elevation: 12,
  },
  iconCircle: {
    width: 54,
    height: 54,
    marginBottom: 13,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEAF0',
  },
  eyebrow: {
    color: '#DF6A89',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.15,
  },
  title: {
    marginTop: 5,
    color: COLORS.ink,
    fontSize: 23,
    fontWeight: '900',
  },
  wordPill: {
    maxWidth: '100%',
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: COLORS.purplePale,
  },
  wordPillText: {
    color: COLORS.purpleDark,
    fontSize: 15,
    fontWeight: '900',
  },
  body: {
    marginTop: 14,
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  keepButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#DDD4FF',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  keepButtonText: {
    color: COLORS.purpleDark,
    fontSize: 14,
    fontWeight: '900',
  },
  deleteButton: {
    flex: 1.15,
    minHeight: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: '#E85B7E',
  },
  deleteButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
});
