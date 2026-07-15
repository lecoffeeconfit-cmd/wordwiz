import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles';

export function CompactPagination({
  page,
  pageCount,
  pageSize,
  total,
  itemLabel,
  onPrevious,
  onNext,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const isFirstPage = page === 0;
  const isLastPage = page === pageCount - 1;
  const rangeStart = page * pageSize + 1;
  const rangeEnd = Math.min(rangeStart + pageSize - 1, total);

  return (
    <View style={styles.compactPagination}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show previous ${itemLabel}`}
        accessibilityState={{ disabled: isFirstPage }}
        disabled={isFirstPage}
        onPress={onPrevious}
        style={({ pressed }) => [
          styles.compactPageButton,
          isFirstPage && styles.compactPageButtonDisabled,
          pressed && !isFirstPage && styles.pressed,
        ]}
      >
        <Ionicons name="chevron-back" size={17} color={COLORS.purpleDark} />
      </Pressable>
      <Text style={styles.compactPageText}>
        {rangeStart}–{rangeEnd} of {total}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show more ${itemLabel}`}
        accessibilityState={{ disabled: isLastPage }}
        disabled={isLastPage}
        onPress={onNext}
        style={({ pressed }) => [
          styles.compactPageButton,
          isLastPage && styles.compactPageButtonDisabled,
          pressed && !isLastPage && styles.pressed,
        ]}
      >
        <Ionicons name="chevron-forward" size={17} color={COLORS.purpleDark} />
      </Pressable>
    </View>
  );
}
