import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, TILE_COLORS } from '../../constants/theme';
import type { Tab, Word } from '../../types';
import { styles } from '../../styles';

export function BottomTabs({
  activeTab,
  bottomInset,
  quizComplete,
  onChange,
}: {
  activeTab: Tab;
  bottomInset: number;
  quizComplete: boolean;
  onChange: (tab: Tab) => void;
}) {
  const tabs: {
    key: Tab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: 'words', label: 'Words', icon: 'book-outline', activeIcon: 'book' },
    {
      key: 'cards',
      label: 'Cards',
      icon: 'albums-outline',
      activeIcon: 'albums',
    },
    {
      key: 'quiz',
      label: 'Quiz',
      icon: 'trophy-outline',
      activeIcon: 'trophy',
    },
    {
      key: 'dashboard',
      label: 'Stats',
      icon: 'bar-chart-outline',
      activeIcon: 'bar-chart',
    },
  ];

  const bottomPadding = Math.max(8, Math.min(bottomInset, 14));

  return (
    <View style={[styles.bottomTabs, { paddingBottom: bottomPadding }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={styles.tabButton}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <Ionicons
                name={active ? tab.activeIcon : tab.icon}
                size={22}
                color={active ? COLORS.purpleDark : COLORS.muted}
              />
              {tab.key === 'quiz' && quizComplete && (
                <View style={styles.completeDot}>
                  <Ionicons name="checkmark" size={8} color={COLORS.white} />
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
