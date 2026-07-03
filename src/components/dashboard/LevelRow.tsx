import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { styles } from '../../styles';

export function LevelRow({
  color,
  label,
  value,
  sparkly = false,
}: {
  color: string;
  label: string;
  value: number;
  sparkly?: boolean;
}) {
  return (
    <View style={styles.levelRow}>
      <View style={[styles.levelDot, { backgroundColor: color }]} />
      <Text style={styles.levelLabel}>{label}</Text>
      {sparkly ? (
        <View style={styles.levelSparkles}>
          <Ionicons name="sparkles" size={12} color={COLORS.greenDark} />
          <Ionicons name="star" size={8} color={COLORS.yellow} />
        </View>
      ) : null}
      <Text style={styles.levelValue}>{value}</Text>
    </View>
  );
}
