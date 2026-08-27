import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, Word } from '../types';
import { styles } from '../styles';
import { buildWordWizWidgetSnapshot } from '../widgets/config';
import {
  DEFAULT_WORDWIZ_WIDGET_CONFIG,
  type WordWizWidgetConfig,
  type WordWizWidgetRefresh,
  type WordWizWidgetSize,
  type WordWizWidgetSource,
  type WordWizWidgetStyle,
  type WordWizWidgetType,
} from '../widgets/types';
import {
  loadWordWizWidgetConfig,
  saveWordWizWidgetConfig,
} from '../services';

type WidgetType = WordWizWidgetType;
type WidgetSize = WordWizWidgetSize;
type WidgetSource = WordWizWidgetSource;
type WidgetRefresh = WordWizWidgetRefresh;
type WidgetStyle = WordWizWidgetStyle;

const WIDGET_TYPES: Array<{
  id: WidgetType;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
}> = [
  {
    id: 'review-word',
    title: 'Word Review',
    detail: 'Learn the next word',
    icon: 'refresh-outline',
    color: COLORS.blue,
    background: COLORS.bluePale,
  },
  {
    id: 'word-of-the-day',
    title: 'Word of the Day',
    detail: 'One fresh word',
    icon: 'sunny-outline',
    color: COLORS.orange,
    background: COLORS.orangePale,
  },
  {
    id: 'daily-challenge',
    title: 'Daily Challenge',
    detail: 'Recall before reveal',
    icon: 'sparkles-outline',
    color: COLORS.purpleDark,
    background: COLORS.purplePale,
  },
  {
    id: 'streak',
    title: 'Streak',
    detail: 'Keep it going',
    icon: 'flame-outline',
    color: '#D68C27',
    background: COLORS.yellowPale,
  },
  {
    id: 'words-due',
    title: 'Words Due',
    detail: 'See today’s queue',
    icon: 'book-outline',
    color: COLORS.purpleDark,
    background: COLORS.purplePale,
  },
];

const SOURCES: Array<{ id: WidgetSource; label: string }> = [
  { id: 'saved', label: 'Saved words' },
  { id: 'flagged', label: 'Flagged words' },
  { id: 'weak', label: 'Weak words' },
  { id: 'random', label: 'Random' },
];

const WIDGET_STYLES: Array<{
  id: WidgetStyle;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  stageBackground: string;
  stageBorder: string;
  cardBackground: string;
  accent: string;
  titleColor: string;
  valueColor: string;
  detailColor: string;
  footerColor: string;
  quickAddColor: string;
}> = [
  {
    id: 'midnight',
    label: 'Midnight',
    detail: 'Golden glow',
    icon: 'moon-outline',
    stageBackground: '#DDE9FF',
    stageBorder: '#D4E1FF',
    cardBackground: '#17120A',
    accent: '#FFD86B',
    titleColor: '#FFD86B',
    valueColor: '#FFF2A8',
    detailColor: '#E8C868',
    footerColor: '#B9953F',
    quickAddColor: '#FFE9A3',
  },
  {
    id: 'notebook',
    label: 'Notebook',
    detail: 'Warm + calm',
    icon: 'sunny-outline',
    stageBackground: '#FFF3E3',
    stageBorder: '#FFE2C2',
    cardBackground: '#FFFDF8',
    accent: COLORS.orange,
    titleColor: '#B47720',
    valueColor: COLORS.ink,
    detailColor: COLORS.muted,
    footerColor: '#A98D72',
    quickAddColor: COLORS.greenDark,
  },
  {
    id: 'meadow',
    label: 'Meadow',
    detail: 'Cool + airy',
    icon: 'leaf-outline',
    stageBackground: '#E8FBF4',
    stageBorder: '#CDEFE3',
    cardBackground: '#123B52',
    accent: '#8EDCFF',
    titleColor: '#8EDCFF',
    valueColor: COLORS.white,
    detailColor: '#B9E7FF',
    footerColor: '#70B7DC',
    quickAddColor: '#DDF5FF',
  },
];

const WIDGET_SIZE_CONFIG: Record<
  WidgetSize,
  { cardMinHeight: number; cardPadding: number; valueSize: number; titleTop: number; footerTop: number }
> = {
  small: {
    cardMinHeight: 126,
    cardPadding: 14,
    valueSize: 20,
    titleTop: 12,
    footerTop: 12,
  },
  medium: {
    cardMinHeight: 184,
    cardPadding: 17,
    valueSize: 25,
    titleTop: 18,
    footerTop: 20,
  },
  large: {
    cardMinHeight: 222,
    cardPadding: 20,
    valueSize: 30,
    titleTop: 24,
    footerTop: 24,
  },
};

export function WidgetSetupScreen({
  words,
  analytics,
  dailyLearningGoal,
  userId,
  onClose,
}: {
  words: Word[];
  analytics: AnalyticsData;
  dailyLearningGoal: number;
  userId: string | null;
  onClose: () => void;
}) {
  const [widgetType, setWidgetType] = useState<WidgetType>(DEFAULT_WORDWIZ_WIDGET_CONFIG.widgetType);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>(DEFAULT_WORDWIZ_WIDGET_CONFIG.size);
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>(DEFAULT_WORDWIZ_WIDGET_CONFIG.style);
  const [source, setSource] = useState<WidgetSource>(DEFAULT_WORDWIZ_WIDGET_CONFIG.source);
  const [refresh, setRefresh] = useState<WidgetRefresh>(DEFAULT_WORDWIZ_WIDGET_CONFIG.refresh);
  const [quickAddEnabled, setQuickAddEnabled] = useState(DEFAULT_WORDWIZ_WIDGET_CONFIG.quickAddEnabled);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
 const [showAddGuide, setShowAddGuide] = useState(false);
 const previewMotion = useRef(new Animated.Value(1)).current;
  const isFixedDailyWidget = widgetType === 'word-of-the-day' || widgetType === 'daily-challenge';
  const effectiveRefresh: WidgetRefresh = isFixedDailyWidget ? 'daily' : refresh;
 const config: WordWizWidgetConfig = {
    widgetType,
    size: widgetSize,
    style: widgetStyle,
    source,
    refresh: effectiveRefresh,
    quickAddEnabled,
  };
  const widgetSnapshot = useMemo(
    () => buildWordWizWidgetSnapshot(config, words, analytics, dailyLearningGoal),
    [analytics, config, dailyLearningGoal, words],
  );
  const selectedWidget = WIDGET_TYPES.find((item) => item.id === widgetType) ?? WIDGET_TYPES[0];
  const selectedWidgetStyle = WIDGET_STYLES.find((item) => item.id === widgetStyle) ?? WIDGET_STYLES[0];
  const selectedWidgetSize = WIDGET_SIZE_CONFIG[widgetSize];
  const previewKey = `${widgetType}-${widgetStyle}-${widgetSize}-${source}-${refresh}-${quickAddEnabled}`;
  const previewWord = widgetSnapshot.currentWord;
  const previewTitle = widgetType === 'review-word'
    ? 'Word review'
    : widgetType === 'word-of-the-day'
      ? 'Word of the day'
      : widgetType === 'daily-challenge'
        ? 'Can you remember this?'
        : widgetType === 'streak'
          ? 'Learning streak'
          : 'Words ready for review';
  const previewValue = widgetType === 'streak'
    ? `🔥 ${widgetSnapshot.streakCurrent}`
    : widgetType === 'words-due'
      ? `📖 ✦ ${widgetSnapshot.dueCount}`
      : previewWord.term;
  const previewUpcoming = widgetSnapshot.rotationWords
    .filter((item) => item.id !== previewWord.id || item.term !== previewWord.term)
    .slice(0, 3);
  const previewMeta = [previewWord.partOfSpeech, previewWord.pronunciation].filter(Boolean).join(' · ');
  const previewDetail = widgetType === 'daily-challenge'
    ? 'Definition hidden · tap to review'
    : widgetType === 'streak'
      ? `${widgetSnapshot.activitiesToday} of ${widgetSnapshot.dailyGoal} activities today`
      : widgetType === 'words-due'
        ? widgetSnapshot.retentionHasEvidence
          ? `${widgetSnapshot.retentionPercent}% retention`
          : 'Retention builds with more reviews'
        : previewWord.plainDefinition;
  const previewSupporting = widgetType === 'daily-challenge'
    ? ''
    : widgetType === 'streak'
    ? 'Keep the learning chain alive.'
    : widgetType === 'words-due'
      ? widgetSnapshot.dueCount > 0 ? 'A focused review is waiting.' : 'You’re all caught up.'
      : previewWord.example
        ? `“${previewWord.example.replace(/^“|”$/g, '')}”`
        : previewWord.synonyms.length > 0
          ? `Related: ${previewWord.synonyms.join(', ')}`
          : '';

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void loadWordWizWidgetConfig(userId).then((savedConfig) => {
      if (!active) return;
      setWidgetType(savedConfig.widgetType);
      setWidgetSize(savedConfig.size);
     setWidgetStyle(savedConfig.style);
     setSource(savedConfig.source);
      setRefresh(savedConfig.widgetType === 'word-of-the-day' || savedConfig.widgetType === 'daily-challenge' ? 'daily' : savedConfig.refresh);
     setQuickAddEnabled(savedConfig.quickAddEnabled);
      setIsSaved(true);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    previewMotion.setValue(0.965);
    const animation = Animated.spring(previewMotion, {
      toValue: 1,
      damping: 16,
      stiffness: 240,
      mass: 0.7,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [previewKey, previewMotion]);

  return (
    <View style={styles.widgetSetupScreen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.widgetSetupContent}
      >
        <View style={styles.widgetSetupTopRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to WordWiz"
            onPress={onClose}
            style={({ pressed }) => [styles.widgetBackButton, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.purpleDark} />
          </Pressable>
          <Text style={styles.widgetSetupEyebrow}>PERSONALIZE YOUR SHORTCUTS</Text>
          <View style={styles.widgetSetupTopSpacer} />
        </View>

        <Text style={styles.widgetSetupTitle}>Bring WordWiz with you</Text>
        <Text style={styles.widgetSetupSubtitle}>
          Keep one useful learning moment close by, whether you’re on your Home Screen or Lock Screen.
        </Text>

        <View
          style={[
            styles.widgetPreviewStage,
            {
              backgroundColor: selectedWidgetStyle.stageBackground,
              borderColor: selectedWidgetStyle.stageBorder,
            },
          ]}
        >
          <View style={[styles.widgetPreviewStageAccent, { backgroundColor: selectedWidgetStyle.accent }]} />
          <View style={styles.widgetPreviewHeader}>
            <View>
              <Text style={styles.widgetPreviewStageLabel}>PREVIEW</Text>
              <Text style={styles.widgetPreviewStageHint}>Updates {effectiveRefresh === 'daily' ? 'daily' : 'throughout the day'}</Text>
            </View>
            <View style={styles.widgetPreviewSizePill}>
              <Ionicons name="phone-portrait-outline" size={13} color={COLORS.purpleDark} />
              <Text style={styles.widgetPreviewSizeText}>{widgetSize}</Text>
            </View>
          </View>
          <Animated.View
            style={[
              styles.widgetPreviewCard,
              {
                minHeight: selectedWidgetSize.cardMinHeight,
                padding: selectedWidgetSize.cardPadding,
                backgroundColor: selectedWidgetStyle.cardBackground,
                transform: [{ scale: previewMotion }],
              },
            ]}
          >
            <View style={styles.widgetPreviewCardTop}>
              <View style={styles.widgetPreviewBrand}>
                <View style={[styles.widgetPreviewBrandMark, { backgroundColor: selectedWidgetStyle.accent }]}>
                  <Ionicons name="sparkles" size={12} color={COLORS.white} />
                </View>
                <Text style={[styles.widgetPreviewBrandText, { color: selectedWidgetStyle.titleColor }]}>WORDWIZ</Text>
              </View>
              <Ionicons name={selectedWidget.icon} size={17} color={selectedWidgetStyle.titleColor} />
            </View>
            <View style={[styles.widgetPreviewMainRow, { marginTop: selectedWidgetSize.titleTop }]}>
              <View style={styles.widgetPreviewMainCopy}>
                <Text style={[styles.widgetPreviewTitle, { color: selectedWidgetStyle.titleColor }]}>{previewTitle}</Text>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  numberOfLines={1}
                  style={[styles.widgetPreviewValue, { color: selectedWidgetStyle.valueColor, fontSize: selectedWidgetSize.valueSize }]}
                >
                  {previewValue}
                </Text>
              </View>
              {widgetSize !== 'small' && previewUpcoming.length > 0 ? (
                <View style={styles.widgetPreviewUpcoming}>
                  <Text style={[styles.widgetPreviewUpcomingLabel, { color: selectedWidgetStyle.footerColor }]}>UP NEXT</Text>
                  {previewUpcoming.map((item) => (
                    <Text key={item.id || item.term} numberOfLines={1} style={[styles.widgetPreviewUpcomingWord, { color: selectedWidgetStyle.detailColor }]}>
                      {item.term}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
            {previewMeta && widgetType !== 'streak' && widgetType !== 'words-due' ? (
              <Text numberOfLines={1} style={[styles.widgetPreviewMeta, { color: selectedWidgetStyle.titleColor }]}>{previewMeta}</Text>
            ) : null}
            <Text numberOfLines={widgetSize === 'large' ? 2 : 1} style={[styles.widgetPreviewDetail, { color: selectedWidgetStyle.detailColor }]}>{previewDetail}</Text>
            {previewSupporting && widgetSize !== 'small' ? (
              <Text numberOfLines={widgetSize === 'large' ? 2 : 1} style={[styles.widgetPreviewSupporting, { color: selectedWidgetStyle.detailColor }]}>{previewSupporting}</Text>
            ) : null}
            <View style={[styles.widgetPreviewFooter, { marginTop: selectedWidgetSize.footerTop }]}>
              <Text style={[styles.widgetPreviewFooterText, { color: selectedWidgetStyle.footerColor }]}>
                {widgetType === 'daily-challenge'
                  ? 'Tap to review →'
                  : widgetType === 'streak'
                    ? `${widgetSnapshot.activitiesToday}/${widgetSnapshot.dailyGoal} today`
                    : widgetType === 'words-due'
                      ? widgetSnapshot.retentionHasEvidence ? `${widgetSnapshot.retentionPercent}% retention` : 'Keep reviewing'
                      : 'Tap to keep learning'}
              </Text>
              {quickAddEnabled && widgetSize !== 'small' ? (
                <Text style={[styles.widgetPreviewQuickAdd, { color: selectedWidgetStyle.quickAddColor }]}>+ Quick Add</Text>
              ) : null}
            </View>
          </Animated.View>
        </View>

        <WidgetSectionLabel label="Widget type" />
        <View style={styles.widgetOptionGrid}>
          {WIDGET_TYPES.map((item) => {
            const active = item.id === widgetType;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${active ? 'Selected' : 'Select widget type'}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                 setWidgetType(item.id);
                  if (item.id === 'word-of-the-day' || item.id === 'daily-challenge') setRefresh('daily');
                 setIsSaved(false);
                }}
                style={({ pressed }) => [
                  styles.widgetOptionCard,
                  active && styles.widgetOptionCardActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.widgetOptionIcon, { backgroundColor: item.background }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <Text numberOfLines={1} style={styles.widgetOptionTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.widgetOptionDetail}>{item.detail}</Text>
                {active ? (
                  <View style={styles.widgetOptionCheck}>
                    <Ionicons name="checkmark" size={11} color={COLORS.white} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <WidgetSectionLabel label="Style" />
        <View style={styles.widgetStyleGrid}>
          {WIDGET_STYLES.map((item) => {
            const active = item.id === widgetStyle;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} widget style. ${active ? 'Selected' : 'Select style'}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setWidgetStyle(item.id);
                  setIsSaved(false);
                }}
                style={({ pressed }) => [
                  styles.widgetStyleOption,
                  active && styles.widgetStyleOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                  <View style={styles.widgetStyleSwatchRow}>
                  <View style={[styles.widgetStyleSwatch, { backgroundColor: item.cardBackground }]}>
                    <Ionicons name={item.icon} size={14} color={item.accent} />
                  </View>
                  {active ? (
                    <View style={styles.widgetStyleCheck}>
                      <Ionicons name="checkmark" size={10} color={COLORS.white} />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.widgetStyleTitle}>{item.label}</Text>
                <Text style={styles.widgetStyleDetail}>{item.detail}</Text>
              </Pressable>
            );
          })}
        </View>

        {widgetType === 'review-word' ? (
          <>
            <WidgetSectionLabel label="Pull from" />
            <View style={styles.widgetChipRow}>
              {SOURCES.map((item) => {
                const active = item.id === source;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setSource(item.id);
                      setIsSaved(false);
                    }}
                    style={({ pressed }) => [
                      styles.widgetChip,
                      active && styles.widgetChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.widgetChipText, active && styles.widgetChipTextActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <WidgetSectionLabel label="Size" />
        <View style={styles.widgetSegmentRow}>
          {(['small', 'medium', 'large'] as WidgetSize[]).map((size) => {
            const active = size === widgetSize;
            return (
              <Pressable
                key={size}
                accessibilityRole="button"
                accessibilityLabel={`${size} widget size. ${active ? 'Selected' : 'Select size'}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setWidgetSize(size);
                  setIsSaved(false);
                }}
                style={({ pressed }) => [
                  styles.widgetSegment,
                  active && styles.widgetSegmentActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.widgetSegmentText, active && styles.widgetSegmentTextActive]}>
                  {size[0].toUpperCase() + size.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <WidgetSectionLabel label="Refresh style" />
        <View style={styles.widgetSegmentRow}>
          {([
            ['daily', 'Once a day'],
            ['throughout-day', 'Throughout the day'],
          ] as Array<[WidgetRefresh, string]>).filter(([id]) => !isFixedDailyWidget || id === 'daily').map(([id, label]) => {
            const active = id === refresh;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={`${label} refresh. ${active ? 'Selected' : 'Select refresh style'}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setRefresh(id);
                  setIsSaved(false);
                }}
                style={({ pressed }) => [
                  styles.widgetSegment,
                  active && styles.widgetSegmentActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.widgetSegmentText, active && styles.widgetSegmentTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: quickAddEnabled }}
          onPress={() => {
            setQuickAddEnabled((enabled) => !enabled);
            setIsSaved(false);
          }}
          style={({ pressed }) => [styles.widgetQuickAddRow, pressed && styles.pressed]}
        >
          <View style={styles.widgetQuickAddIcon}>
            <Ionicons name="add" size={19} color={COLORS.purpleDark} />
          </View>
          <View style={styles.widgetQuickAddCopy}>
            <Text style={styles.widgetQuickAddTitle}>Quick Add Word shortcut</Text>
            <Text style={styles.widgetQuickAddDetail}>Keep a one-tap way to save a word nearby.</Text>
          </View>
          <View style={[styles.widgetToggle, quickAddEnabled && styles.widgetToggleActive]}>
            <View style={[styles.widgetToggleKnob, quickAddEnabled && styles.widgetToggleKnobActive]} />
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSaved ? 'See how to add the WordWiz widget' : 'Learn how to add the WordWiz widget'}
          accessibilityHint={isSaved ? 'Opens the three-step Home Screen guide' : 'Save your setup first to see the Home Screen guide'}
          disabled={!isSaved}
          onPress={() => setShowAddGuide(true)}
          style={({ pressed }) => [
            styles.widgetInstructionCard,
            isSaved && styles.widgetInstructionCardReady,
            pressed && isSaved && styles.pressed,
          ]}
        >
          <View style={styles.widgetInstructionIcon}>
            <Ionicons name={isSaved ? 'sparkles-outline' : 'phone-portrait-outline'} size={20} color={COLORS.purpleDark} />
          </View>
          <View style={styles.widgetInstructionCopy}>
            <Text style={styles.widgetInstructionLabel}>{isSaved ? 'NEXT STEP' : 'ALMOST THERE'}</Text>
            <Text style={styles.widgetInstructionTitle}>
              {isSaved ? 'Add WordWiz to your Home Screen.' : 'Save your setup, then add WordWiz.'}
            </Text>
            <Text style={styles.widgetInstructionText}>
              {isSaved
                ? 'Tap here for a simple three-step guide. iPhone keeps the final add in your hands.'
                : 'Choose your look and size above. We’ll show you exactly what to do next.'}
            </Text>
          </View>
          {isSaved ? (
            <View style={styles.widgetInstructionArrow}>
              <Ionicons name="arrow-forward" size={16} color={COLORS.purpleDark} />
            </View>
          ) : null}
        </Pressable>

        {saveError ? <Text style={styles.widgetSaveError}>{saveError}</Text> : null}
        <Pressable
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={isSaving ? 'Saving widget setup' : isSaved ? 'Widget setup saved' : 'Save widget setup'}
          accessibilityHint="Saves these widget choices"
          onPress={() => {
            if (!userId) {
              setSaveError('Sign in to save widget settings to this device.');
              return;
            }
            setIsSaving(true);
            setSaveError(null);
            void saveWordWizWidgetConfig(userId, config, words, analytics, dailyLearningGoal)
              .then(() => {
                setIsSaved(true);
                setShowAddGuide(true);
              })
              .catch(() => setSaveError('Could not save the widget setup. Please try again.'))
              .finally(() => setIsSaving(false));
          }}
          style={({ pressed }) => [styles.widgetSaveButton, isSaving && { opacity: 0.55 }, pressed && styles.pressed]}
        >
          <Ionicons name={isSaving ? 'cloud-upload-outline' : isSaved ? 'checkmark-circle' : 'sparkles-outline'} size={18} color={COLORS.white} />
          <Text style={styles.widgetSaveButtonText}>{isSaving ? 'Saving widget setup…' : isSaved ? 'Widget setup saved' : 'Save widget setup'}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showAddGuide}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddGuide(false)}
      >
        <View style={styles.widgetGuideBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close widget guide"
            onPress={() => setShowAddGuide(false)}
            style={styles.widgetGuideBackdropDismiss}
          />
          <View accessibilityViewIsModal style={styles.widgetGuideSheet}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.widgetGuideContent}
            >
              <View style={styles.widgetGuideHandle} />
              <View style={styles.widgetGuideHeroIcon}>
                <Ionicons name="phone-portrait-outline" size={27} color={COLORS.purpleDark} />
                <View style={styles.widgetGuideHeroSparkle}>
                  <Ionicons name="sparkles" size={11} color={COLORS.white} />
                </View>
              </View>
              <Text style={styles.widgetGuideEyebrow}>ONE LAST STEP</Text>
              <Text style={styles.widgetGuideTitle}>Your WordWiz widget is ready.</Text>
              <Text style={styles.widgetGuideSubtitle}>
                Add it from your iPhone’s widget gallery. It only takes a few taps.
              </Text>

              <View style={styles.widgetGuideSteps}>
                <WidgetGuideStep
                  number="1"
                  icon="hand-left-outline"
                  title="Touch and hold"
                  detail="Press and hold an empty spot on your Home Screen until the apps gently wiggle."
                />
                <WidgetGuideStep
                  number="2"
                  icon="add-circle-outline"
                  title="Tap the + button"
                  detail="It’s in the top corner. This opens Apple’s widget gallery."
                />
                <WidgetGuideStep
                  number="3"
                  icon="search-outline"
                  title="Find WordWiz"
                  detail="Search WordWiz, choose your saved size, then tap Add Widget."
                  isLast
                />
              </View>

              <View style={styles.widgetGuideNote}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.greenDark} />
                <Text style={styles.widgetGuideNoteText}>
                  Your saved WordWiz choices will be ready when the widget appears.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close widget guide and add WordWiz now"
                onPress={() => setShowAddGuide(false)}
                style={({ pressed }) => [styles.widgetGuideButton, pressed && styles.pressed]}
              >
                <Text style={styles.widgetGuideButtonText}>I’ll add it now</Text>
                <Ionicons name="arrow-forward" size={17} color={COLORS.white} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close widget guide"
                onPress={() => setShowAddGuide(false)}
                style={({ pressed }) => [styles.widgetGuideLaterButton, pressed && styles.pressed]}
              >
                <Text style={styles.widgetGuideLaterText}>Maybe later</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function WidgetSectionLabel({ label }: { label: string }) {
  return <Text style={styles.widgetSectionLabel}>{label}</Text>;
}

function WidgetGuideStep({
  number,
  icon,
  title,
  detail,
  isLast = false,
}: {
  number: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.widgetGuideStep, isLast && styles.widgetGuideStepLast]}>
      <View style={styles.widgetGuideStepNumber}>
        <Text style={styles.widgetGuideStepNumberText}>{number}</Text>
      </View>
      <View style={styles.widgetGuideStepIcon}>
        <Ionicons name={icon} size={19} color={COLORS.purpleDark} />
      </View>
      <View style={styles.widgetGuideStepCopy}>
        <Text style={styles.widgetGuideStepTitle}>{title}</Text>
        <Text style={styles.widgetGuideStepDetail}>{detail}</Text>
      </View>
    </View>
  );
}
