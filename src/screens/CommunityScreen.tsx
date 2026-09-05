import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SOFT_SHADOW, WORDWIZ_GRADIENT_COLORS } from '../constants/theme';
import { LevelMagicIcon, MiniLeaderboardCrest } from '../components';
import {
  type CommunityConnection,
  type CommunityContext,
  type CommunityLeaderboardEntry,
  type CommunityLevel,
  type CommunityNudge,
  type CommunityPeriod,
  type CompetitiveMetric,
  type WordCollectorAudience,
  type WordCollectorContext,
  type WordCollectorEntry,
  type WordCollectorLocationPermission,
  type WordCollectorPeriod,
  deactivateCommunityPushTokens,
  enableWordCollectorLocation,
  getCommunityAvatarUrl,
  getCommunityConnections,
  getCommunityContext,
  getCommunityExpoPushToken,
  getCommunityLeaderboard,
  getCommunityNudges,
  getCompetitiveMetricContext,
  getCompetitiveMetricLeaderboard,
  getCompetitiveMetricMyRank,
  getWordCollectorLocationPermission,
  markCommunityNudgeRead,
  pickAndUploadCommunityAvatar,
  registerCommunityPushToken,
  reportCommunityUser,
  removeOrBlockCommunityConnection,
  respondToCommunityFriendRequest,
  sendCommunityFriendRequest,
  sendCommunityFriendRequestByPublicId,
  sendCommunityNudge,
  setCommunityMute,
  setupCommunityProfile,
} from '../services';

type CommunitySection = 'leaderboard' | 'friends' | 'nudges';
type FriendSort = 'recent' | 'alphabetical';

const PAGE_SIZE = 10;
const NUDGE_FETCH_SIZE = 50;
const RAPID_ACCORDION_TOGGLE_GUARD_MS = 400;
const GOLDEN_NUDGE_MAX_LENGTH = 140;
const FRIEND_SORT_LABELS: Record<FriendSort, string> = {
  recent: 'Recently added',
  alphabetical: 'A-Z',
};
const PERIODS: CommunityPeriod[] = ['daily', 'weekly', 'all_time'];
const WORD_COLLECTOR_PERIODS: WordCollectorPeriod[] = ['week', 'month', 'all_time'];
const WORD_COLLECTOR_AUDIENCES: WordCollectorAudience[] = ['all', 'nearby', 'state', 'global'];
const PERIOD_LABELS: Record<CommunityPeriod, string> = {
  daily: 'Today',
  weekly: 'This week',
  all_time: 'All time',
};
const WORD_COLLECTOR_PERIOD_LABELS: Record<WordCollectorPeriod, string> = {
  week: 'Week',
  month: 'Month',
  all_time: 'All Time',
};
const WORD_COLLECTOR_AUDIENCE_LABELS: Record<WordCollectorAudience, string> = {
  all: 'Country',
  nearby: 'Nearby',
  state: 'State',
  global: 'Global',
};
const COMPETITIVE_METRICS: Array<{
  key: CompetitiveMetric;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
}> = [
  { key: 'collectors', label: 'Collectors', icon: 'library-outline', color: COLORS.blue, background: '#EAF6FF' },
  { key: 'retention', label: 'Retention', icon: 'bulb-outline', color: COLORS.purpleDark, background: '#EEE9FF' },
  { key: 'streaks', label: 'Learning Streaks', icon: 'flame-outline', color: COLORS.greenDark, background: '#F2FAF7' },
];
type NudgeOption = {
  key: string;
  type: CommunityNudge['nudgeType'];
  title: string;
  group: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
};
type NudgeGroup = Pick<NudgeOption, 'group' | 'icon' | 'color' | 'background'> & { options: NudgeOption[] };
type CommunityMemberEntry = CommunityLeaderboardEntry | WordCollectorEntry;

function isCommunityLeaderboardEntry(entry: CommunityMemberEntry): entry is CommunityLeaderboardEntry {
  return 'level' in entry;
}

function nudgeGroup(
  group: string,
  icon: keyof typeof Ionicons.glyphMap,
  color: string,
  background: string,
  options: Array<[string, CommunityNudge['nudgeType'], string, keyof typeof Ionicons.glyphMap]>,
): NudgeGroup {
  return {
    group, icon, color, background,
    options: options.map(([key, type, title, optionIcon]) => ({ key, type, title, group, icon: optionIcon, color, background })),
  };
}

const NUDGE_GROUPS: NudgeGroup[] = [
  nudgeGroup('Friendly encouragement', 'sparkles-outline', COLORS.teal, '#E3F9F2', [
    ['learn_a_word', 'encouragement', '📚 Time to learn a word!', 'book-outline'], ['you_got_this', 'encouragement', '🌟 You’ve got this!', 'sparkles-outline'], ['magic_workout', 'encouragement', '✨ Give your WordWiz magic a quick workout', 'sparkles-outline'], ['keep_building', 'encouragement', '💪 Keep building that vocabulary', 'bar-chart-outline'], ['few_minutes', 'encouragement', '🚀 A few minutes can make a difference', 'rocket-outline'], ['learn_today', 'encouragement', '✨ Learn something new today', 'sparkles-outline'], ['keep_momentum', 'streak_reminder', '🔥 Keep your momentum going', 'flame-outline'], ['next_word_waiting', 'study_reminder', '🎯 Your next word is waiting', 'locate-outline'], ['pearl_gold_cheer', 'encouragement', '🤍💛 Cheering for your next word', 'heart-outline'],
  ]),
  nudgeGroup('Study reminders', 'time-outline', COLORS.purpleDark, '#EEE9FF', [
    ['study_break', 'study_reminder', '⏰ Study break?', 'time-outline'], ['quick_review', 'study_reminder', '📝 Time for a quick review', 'create-outline'], ['flashcards_miss_you', 'study_reminder', '🃏 Your flashcards miss you', 'albums-outline'], ['quick_quiz', 'study_reminder', '🧩 Ready for a quick quiz?', 'help-circle-outline'], ['todays_words', 'study_reminder', '📖 Don’t forget today’s words', 'book-outline'], ['review_before_forget', 'study_reminder', '🔁 Review before you forget', 'repeat-outline'], ['recharge_spellbook', 'study_reminder', '🔮 Recharge your WordWiz spellbook', 'sparkles-outline'], ['new_word_day', 'study_reminder', '☀️ Start your day with a new word', 'sunny-outline'], ['last_review', 'study_reminder', '🌙 One last review before bed', 'moon-outline'], ['pearl_gold_review', 'study_reminder', '🤍💛 A little review magic for you', 'heart-outline'],
  ]),
  nudgeGroup('Competitive nudges', 'trophy-outline', '#B98416', '#FFF1CB', [
    ['leaderboard_spot', 'five_word_challenge', '🏆 I’m coming for your leaderboard spot', 'trophy-outline'], ['right_behind', 'five_word_challenge', '👀 I’m right behind you', 'eye-outline'], ['catch_me', 'five_word_challenge', '⚡ Catch me if you can', 'flash-outline'], ['leaderboard_heating', 'five_word_challenge', '🔥 The leaderboard is heating up', 'flame-outline'], ['beat_score', 'five_word_challenge', '😏 Think you can beat my score?', 'speedometer-outline'], ['quiz_challenge', 'five_word_challenge', '🎯 Quiz challenge incoming', 'locate-outline'], ['who_knows_more', 'five_word_challenge', '🧠 Let’s see who knows more words', 'book-outline'], ['race_next_level', 'five_word_challenge', '🚀 Race you to the next level', 'rocket-outline'], ['top_spot_safe', 'five_word_challenge', '👑 Your top spot isn’t safe', 'ribbon-outline'], ['passed_you', 'five_word_challenge', '💥 I just passed you!', 'trending-up-outline'], ['pearl_gold_race', 'five_word_challenge', '🤍💛 Friendly race to the next word', 'heart-outline'],
  ]),
  nudgeGroup('Challenge invitations', 'flash-outline', COLORS.blue, '#E5F4FF', [
    ['challenge_quiz', 'five_word_challenge', '⚔️ I challenge you to a quiz', 'flash-outline'], ['one_quiz_today', 'five_word_challenge', '🧩 Complete one quiz today', 'help-circle-outline'], ['three_words', 'five_word_challenge', '📚 Learn three new words with me', 'book-outline'], ['five_minutes', 'five_word_challenge', '⏱️ Five-minute study challenge', 'timer-outline'], ['streak_today', 'streak_reminder', '🔥 Keep your streak alive today', 'flame-outline'], ['earn_xp', 'five_word_challenge', '🎯 Try to earn 100 XP', 'star-outline'], ['flashcard_round', 'five_word_challenge', '🃏 Finish a flashcard round', 'albums-outline'], ['race_rank', 'five_word_challenge', '🏁 Race me to the next rank', 'flag-outline'], ['difficult_word', 'five_word_challenge', '💡 Learn one difficult word today', 'bulb-outline'], ['perfect_quiz', 'five_word_challenge', '🧠 Can you get a perfect quiz score?', 'medal-outline'], ['pearl_gold_challenge', 'five_word_challenge', '🤍💛 A five-minute word challenge for us', 'heart-outline'],
  ]),
  nudgeGroup('Celebration nudges', 'sparkles-outline', '#C57A19', '#FFF2D9', [
    ['nice_work', 'encouragement', '🎉 Nice work!', 'sparkles-outline'], ['crushing_it', 'encouragement', '🥳 You’re crushing it', 'happy-outline'], ['great_quiz_score', 'encouragement', '👏 Great quiz score!', 'medal-outline'], ['vocabulary_growing', 'encouragement', '🌟 Your vocabulary is growing', 'trending-up-outline'], ['streak_impressive', 'encouragement', '🔥 That streak is impressive', 'flame-outline'], ['leaderboard_legend', 'encouragement', '🏆 Leaderboard legend', 'trophy-outline'], ['perfect_score', 'encouragement', '💯 Perfect score!', 'ribbon-outline'], ['leveled_up', 'encouragement', '🚀 You just leveled up', 'rocket-outline'], ['word_master', 'encouragement', '👑 Word master in the making', 'sparkles-outline'], ['spellbinding_energy', 'encouragement', '✨ Spellbinding energy!', 'sparkles-outline'], ['pearl_gold_proud', 'encouragement', '🤍💛 So proud of your word power', 'heart-outline'],
  ]),
  nudgeGroup('Comeback nudges', 'reload-outline', '#5898D2', '#E5F2FF', [
    ['wordwiz_misses_you', 'study_reminder', '👋 WordWiz misses you', 'hand-left-outline'], ['comeback_word', 'study_reminder', '🌱 Every comeback starts with one word', 'leaf-outline'], ['restart_streak', 'streak_reminder', '🔄 Ready to restart your streak?', 'repeat-outline'], ['never_late', 'encouragement', '💪 It’s never too late to study', 'heart-outline'], ['jump_back', 'study_reminder', '📚 Jump back in with a quick review', 'book-outline'], ['fresh_start', 'encouragement', '✨ A fresh start is waiting', 'sparkles-outline'], ['wake_magic', 'study_reminder', '🪄 Wake up your WordWiz magic', 'sparkles-outline'], ['back_leaderboard', 'five_word_challenge', '🚀 Let’s get you back on the leaderboard', 'rocket-outline'], ['pearl_gold_return', 'encouragement', '🤍💛 Your words will be here when you’re ready', 'heart-outline'],
  ]),
  nudgeGroup('Playful nudges', 'sparkles-outline', '#8067E8', '#EEE9FF', [
    ['owl_demands', 'study_reminder', '🦉 The WordWiz owl demands knowledge', 'eye-outline'], ['spellbook_called', 'study_reminder', '📜 Your spellbook called—it wants new words', 'book-outline'], ['vocabulary_asleep', 'study_reminder', '💤 Don’t let your vocabulary fall asleep', 'moon-outline'], ['scramble_words', 'study_reminder', '🍳 Time to scramble some words', 'shuffle-outline'], ['nerd_mode', 'encouragement', '🤓 Nerd mode: activated', 'sparkles-outline'], ['unstoppable', 'encouragement', '📖 Open WordWiz. Become unstoppable.', 'book-outline'], ['avoiding_flashcards', 'study_reminder', '👀 I saw you avoiding your flashcards', 'eye-outline'], ['yes_you', 'study_reminder', '🫵 Yes, you. Go study.', 'hand-left-outline'], ['one_quiz_hurt', 'five_word_challenge', '😂 One quiz won’t hurt', 'help-circle-outline'], ['powers_training', 'study_reminder', '🧙 Your word powers need training', 'sparkles-outline'], ['pearl_gold_owl', 'study_reminder', '🤍💛 The WordWiz owl sent you a shiny heart', 'heart-outline'],
  ]),
];
const NUDGE_OPTIONS = NUDGE_GROUPS.flatMap((group) => group.options);
const NUDGE_BY_KEY = new Map(NUDGE_OPTIONS.map((option) => [option.key, option]));
const GOLDEN_NUDGE_GROUP: NudgeGroup = {
  group: 'Golden nudges',
  icon: 'ticket-outline',
  color: '#B98416',
  background: '#FFF3C9',
  options: [],
};
const LEGACY_NUDGE_KEYS: Record<CommunityNudge['nudgeType'], string> = {
  study_reminder: 'study_break',
  streak_reminder: 'keep_momentum',
  five_word_challenge: 'quiz_challenge',
  encouragement: 'you_got_this',
  golden_nudge: 'golden_custom',
};

function nudgeOptionFor(nudge: CommunityNudge) {
  if (nudge.nudgeType === 'golden_nudge' || nudge.messageKey === 'golden_custom') {
    return {
      key: 'golden_custom',
      type: 'golden_nudge' as const,
      title: nudge.customMessage?.trim() || 'A golden nudge',
      group: GOLDEN_NUDGE_GROUP.group,
      icon: GOLDEN_NUDGE_GROUP.icon,
      color: GOLDEN_NUDGE_GROUP.color,
      background: GOLDEN_NUDGE_GROUP.background,
    };
  }
  return NUDGE_BY_KEY.get(nudge.messageKey) ?? NUDGE_BY_KEY.get(LEGACY_NUDGE_KEYS[nudge.nudgeType])!;
}
const TIER_LEGEND: CommunityLevel[] = ['Novice', 'Apprentice', 'Journeyman', 'Adept', 'Mage', 'Master', 'Grandmaster'];
const LEVEL_RULES: Record<CommunityLevel, string> = {
  Novice: 'Remaining 10%',
  Apprentice: 'Next 20%',
  Journeyman: 'Next 25%',
  Adept: 'Next 25%',
  Mage: 'Next 20%',
  Master: 'Next 5%',
  Grandmaster: 'Top 25',
};

function initialFor(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || 'W';
}

function formatPublicStat(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatNudgeTimestamp(createdAt: string) {
  const sentAt = new Date(createdAt);
  if (Number.isNaN(sentAt.getTime())) return 'Time unavailable';

  const now = new Date();
  const sameDay = sentAt.getFullYear() === now.getFullYear()
    && sentAt.getMonth() === now.getMonth()
    && sentAt.getDate() === now.getDate();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday = sentAt.getFullYear() === yesterday.getFullYear()
    && sentAt.getMonth() === yesterday.getMonth()
    && sentAt.getDate() === yesterday.getDate();
  const time = sentAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (sameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${sentAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

function collectorMetricValueLabel(metric: CompetitiveMetric, entry: WordCollectorEntry) {
  if (metric === 'retention') {
    return `${Math.max(0, Math.round(entry.retentionPercent ?? entry.metricValue ?? 0))}%`;
  }
  if (metric === 'streaks') {
    return `${Math.max(0, Math.round(entry.streakDays ?? entry.metricValue ?? 0))}d`;
  }
  return `${Math.max(0, Math.round(entry.wordCount)).toLocaleString()} ${entry.wordCount === 1 ? 'word' : 'words'}`;
}

function formatJoinedDate(joinedAt: string | undefined) {
  if (!joinedAt) return 'Connect member';
  const date = new Date(joinedAt);
  if (Number.isNaN(date.getTime())) return 'Connect member';
  return `Joined ${date.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
}

function formatFriendConnectionTime(addedAt: string | undefined) {
  if (!addedAt) return 'Date unavailable';
  const date = new Date(addedAt);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} at ${timeLabel}`;
}

function retentionReviewBreakdownParts(source: Pick<WordCollectorEntry, 'flashcardReviewCount' | 'quizAnswerCount' | 'testAnswerCount' | 'gameAnswerCount'>) {
  const count = (value: number | undefined) => Math.max(0, Math.round(value ?? 0));
  const activities = [
    { value: count(source.flashcardReviewCount), label: 'card' },
    { value: count(source.quizAnswerCount), label: 'quiz' },
    { value: count(source.testAnswerCount), label: 'test' },
    { value: count(source.gameAnswerCount), label: 'game' },
  ]
    .filter((activity) => activity.value > 0)
    .sort((left, right) => right.value - left.value)
    .map((activity) => `${activity.value.toLocaleString()} ${activity.label}${activity.value === 1 ? '' : 's'}`);

  return activities.length ? activities.join(' / ') : null;
}

function retentionReviewBreakdownText(source: Pick<WordCollectorEntry, 'reviewCount' | 'flashcardReviewCount' | 'quizAnswerCount' | 'testAnswerCount' | 'gameAnswerCount'>) {
  const total = Math.max(0, Math.round(source.reviewCount ?? 0));
  const reviewLabel = total === 1 ? 'review' : 'reviews';
  const parts = retentionReviewBreakdownParts(source);
  return parts ? `${total.toLocaleString()} ${reviewLabel} · ${parts}` : `${total.toLocaleString()} ${reviewLabel}`;
}

type RetentionReviewActivitySource = Pick<
  WordCollectorEntry,
  'reviewCount' | 'flashcardReviewCount' | 'quizAnswerCount' | 'testAnswerCount' | 'gameAnswerCount'
>;

function RetentionReviewActivity({ source }: { source: RetentionReviewActivitySource }) {
  const total = Math.max(0, Math.round(source.reviewCount ?? 0));
  const reviewLabel = total === 1 ? 'review' : 'reviews';
  const parts = retentionReviewBreakdownParts(source);
  const summary = parts ? `${total.toLocaleString()} ${reviewLabel} · ${parts}` : `${total.toLocaleString()} ${reviewLabel}`;

  return (
    <Text
      numberOfLines={1}
      ellipsizeMode="tail"
      style={community.collectorReviewActivity}
      accessibilityLabel={`Review activity: ${summary}`}
    >
      {summary}
    </Text>
  );
}

function useReducedMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function cacheKey(period: CommunityPeriod, page: number, level: CommunityLevel | null) {
  return `${period}:${level ?? 'all'}:${page}`;
}

function wordCollectorCacheKey(metric: CompetitiveMetric, period: WordCollectorPeriod, audience: WordCollectorAudience, page: number) {
  return `${metric}:${period}:${audience}:${page}`;
}

function levelPresentation(level: CommunityLevel) {
  switch (level) {
    case 'Grandmaster': return { name: level, icon: 'ribbon' as const, color: '#B98416', background: '#FFF1CB' };
    case 'Master': return { name: level, icon: 'flame-outline' as const, color: '#F19A45', background: '#FFF0DF' };
    case 'Mage': return { name: level, icon: 'sparkles-outline' as const, color: '#8067E8', background: '#EEE9FF' };
    case 'Adept': return { name: level, icon: 'star-outline' as const, color: '#FFD23F', background: '#FFF2B8' };
    case 'Journeyman': return { name: level, icon: 'navigate-outline' as const, color: '#3CCFC4', background: '#D9F7F3' };
    case 'Apprentice': return { name: level, icon: 'leaf-outline' as const, color: '#36BDA2', background: '#E1F8F4' };
    default: return { name: level, icon: 'leaf-outline' as const, color: '#69A4D7', background: '#E5F2FF' };
  }
}

function LevelPresentationIcon({ level, size }: { level: CommunityLevel; size: number }) {
  const tier = levelPresentation(level);
  if (level === 'Adept') {
    return <LevelMagicIcon level={level} size={size} variant="bare" color={tier.color} />;
  }
  return <Ionicons name={tier.icon} size={size} color={tier.color} />;
}

function WordWizardLabel({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text style={style}>
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
  );
}

type LeaderboardPlacement = 'champion' | 'gold' | 'silver' | 'bronze' | null;

function leaderboardPlacementFor(rank: number | null | undefined, level?: CommunityLevel): LeaderboardPlacement {
  if (rank === 1) return 'champion';
  if (rank === 1) return 'gold';
  if (typeof rank === 'number' && rank >= 2 && rank <= 5) return 'gold';
  if (typeof rank === 'number' && rank >= 6 && rank <= 15) return 'silver';
  if (typeof rank === 'number' && rank >= 16 && rank <= 30) return 'bronze';
  return null;
}

function ChampionRankBackdrop({ reduceMotion }: { reduceMotion: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (reduceMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[community.rankRowChampionBackdrop, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) }]}
    >
      <LinearGradient
        colors={WORDWIZ_GRADIENT_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function CommunityAvatar({
  name,
  avatarPath,
  small = false,
  large = false,
}: {
  name: string;
  avatarPath?: string | null;
  small?: boolean;
  large?: boolean;
}) {
  const avatarUrl = getCommunityAvatarUrl(avatarPath ?? null);
  return (
    <View style={[community.avatar, small && community.avatarSmall, large && community.avatarLarge]}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={community.avatarImage} accessibilityLabel={`${name}'s profile picture`} />
      ) : (
        <Text style={[community.avatarText, small && community.avatarTextSmall, large && community.avatarTextLarge]}>
          {initialFor(name)}
        </Text>
      )}
    </View>
  );
}

function TierBadge({ level, rank, compact = false, modal = false }: { level: CommunityLevel; rank?: number | null; compact?: boolean; modal?: boolean }) {
  const tier = levelPresentation(level);
  const isChampion = rank === 1;
  return (
    <View style={[
      community.tierBadge,
      compact && community.tierBadgeCompact,
      modal && community.tierBadgeModal,
      { backgroundColor: isChampion ? '#F0ECFF' : tier.background },
      modal && { borderColor: isChampion ? '#C9BFFF' : level === 'Grandmaster' ? '#E9CF89' : tier.background },
    ]}>
      {isChampion ? (
        <Image source={require('../../assets/splash-icon.png')} style={[community.tierBadgeAppIcon, compact && community.tierBadgeAppIconCompact]} />
      ) : (
        <LevelPresentationIcon level={level} size={compact ? 12 : 13} />
      )}
      {isChampion ? (
        <WordWizardLabel style={[community.tierBadgeText, compact && community.tierBadgeTextCompact]} />
      ) : (
        <Text style={[community.tierBadgeText, compact && community.tierBadgeTextCompact, { color: tier.color }]}>{tier.name}</Text>
      )}
    </View>
  );
}

function Preference({
  label,
  detail,
  value,
  onChange,
  status,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
  status?: string;
}) {
  return (
    <View style={community.preference}>
      <View style={community.preferenceCopy}>
        <View style={community.preferenceTitleRow}>
          <Text style={community.preferenceTitle}>{label}</Text>
          {status ? (
            <Text style={[community.preferenceStatus, value ? community.preferenceStatusActive : community.preferenceStatusInactive]}>
              {status}
            </Text>
          ) : null}
        </View>
        <Text style={community.preferenceDetail}>{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#DAD6EA', true: COLORS.green }}
        thumbColor={COLORS.white}
      />
    </View>
  );
}

function ScoreExplainer({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const lastCollapseAtRef = useRef(0);

  const handleTriggerPress = () => {
    const now = Date.now();
    if (now - lastCollapseAtRef.current < RAPID_ACCORDION_TOGGLE_GUARD_MS) return;

    if (expanded) lastCollapseAtRef.current = now;
    onToggle();
  };

  return (
    <View style={community.scoreExplainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Collapse How Social XP works' : 'Expand How Social XP works'}
        accessibilityHint={expanded ? 'Hides details about how Social XP is earned' : 'Shows details about how Social XP is earned'}
        onPress={handleTriggerPress}
        style={community.scoreExplainerTrigger}
      >
        <View style={community.scoreExplainerIcon}>
          <Ionicons name="information-circle-outline" size={21} color={COLORS.purpleDark} />
        </View>
        <View style={community.scoreExplainerCopy}>
          <Text style={community.scoreExplainerTitle}>How Social XP works</Text>
          <Text style={community.scoreExplainerSubtitle}>See what adds to the leaderboard</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.muted} />
      </Pressable>
      {expanded ? (
        <View style={community.scoreDetails}>
          <View style={community.scoreRule}>
            <View style={[community.scoreRuleIcon, community.scoreRuleIconQuiz]}>
              <Ionicons name="school-outline" size={18} color={COLORS.purpleDark} />
            </View>
            <View style={community.scoreRuleCopy}>
              <Text style={community.scoreRuleTitle}>Practice & daily quizzes</Text>
              <Text style={community.scoreRuleText}>Every correct answer earns 3 Social XP, wherever you start the quiz.</Text>
            </View>
          </View>
          <View style={community.scoreRule}>
            <View style={[community.scoreRuleIcon, community.scoreRuleIconOmega]}>
              <Ionicons name="flash-outline" size={18} color={COLORS.blue} />
            </View>
            <View style={community.scoreRuleCopy}>
              <Text style={community.scoreRuleTitle}>Omega Tests</Text>
              <Text style={community.scoreRuleText}>Every correct Omega Test answer earns 5 Social XP.</Text>
            </View>
          </View>
          <View style={community.scoreRule}>
            <View style={[community.scoreRuleIcon, community.scoreRuleIconCards]}>
              <Ionicons name="layers-outline" size={18} color={COLORS.greenDark} />
            </View>
            <View style={community.scoreRuleCopy}>
              <Text style={community.scoreRuleTitle}>Flashcard reviews</Text>
              <Text style={community.scoreRuleText}>“Got it” earns 2 XP; “Still learning” earns 1 XP.</Text>
            </View>
          </View>
          <View style={community.scoreRule}>
            <View style={[community.scoreRuleIcon, community.scoreRuleIconRank]}>
              <Ionicons name="stats-chart-outline" size={18} color={COLORS.blue} />
            </View>
            <View style={community.scoreRuleCopy}>
              <Text style={community.scoreRuleTitle}>Rankings</Text>
              <Text style={community.scoreRuleText}>Daily and weekly rankings reset with their time period; All time keeps your full history.</Text>
            </View>
          </View>
          <View style={community.scoreSystemNote}>
            <Text style={community.scoreSystemNoteText}>Social XP is one shared score: learning, flashcard practice, regular quizzes, and Omega Tests all add to it automatically.</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SocialXpExplainerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(0);

  useEffect(() => {
    if (!visible) return;
    sheetTranslateY.stopAnimation();
    sheetTranslateY.setValue(0);
  }, [sheetTranslateY, visible]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gestureState) => (
      gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
    ),
    onPanResponderGrant: () => {
      sheetTranslateY.stopAnimation();
    },
    onPanResponderMove: (_, gestureState) => {
      sheetTranslateY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_, gestureState) => {
      const shouldClose = gestureState.dy > 120 || gestureState.vy > 0.8;
      if (shouldClose) {
        Animated.timing(sheetTranslateY, {
          toValue: Math.max(sheetHeight.current, 800),
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onClose();
        });
        return;
      }

      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminationRequest: () => false,
  }), [onClose, sheetTranslateY]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={community.scoreSheetBackdrop}>
        <Animated.View
          {...panResponder.panHandlers}
          onLayout={(event) => {
            sheetHeight.current = event.nativeEvent.layout.height;
          }}
          style={[community.scoreSheet, { transform: [{ translateY: sheetTranslateY }] }]}
          accessibilityHint="Swipe down to close"
        >
          <View style={community.scoreSheetHandle} />
          <Pressable onPress={onClose} accessibilityLabel="Close Social XP explanation" style={community.scoreSheetClose}>
            <Ionicons name="close" size={20} color={COLORS.muted} />
          </Pressable>
          <View style={community.scoreSheetHeading}>
            <View style={community.scoreExplainerIcon}>
              <Ionicons name="information-circle-outline" size={21} color={COLORS.purpleDark} />
            </View>
            <View style={community.scoreExplainerCopy}>
              <Text style={community.scoreSheetTitle}>How Social XP works</Text>
              <Text style={community.scoreSheetSubtitle}>It is added automatically as you learn.</Text>
            </View>
          </View>
          <View style={community.scoreSheetDetails}>
            <View style={community.scoreRule}>
              <View style={[community.scoreRuleIcon, community.scoreRuleIconQuiz]}>
                <Ionicons name="school-outline" size={18} color={COLORS.purpleDark} />
              </View>
              <View style={community.scoreRuleCopy}>
                <Text style={community.scoreRuleTitle}>Practice & daily quizzes</Text>
                <Text style={community.scoreRuleText}>Every correct answer earns 3 Social XP, wherever you start the quiz.</Text>
              </View>
            </View>
            <View style={community.scoreRule}>
              <View style={[community.scoreRuleIcon, community.scoreRuleIconOmega]}>
                <Ionicons name="flash-outline" size={18} color={COLORS.blue} />
              </View>
              <View style={community.scoreRuleCopy}>
                <Text style={community.scoreRuleTitle}>Omega Tests</Text>
                <Text style={community.scoreRuleText}>Every correct Omega Test answer earns 5 Social XP.</Text>
              </View>
            </View>
            <View style={community.scoreRule}>
              <View style={[community.scoreRuleIcon, community.scoreRuleIconCards]}>
                <Ionicons name="layers-outline" size={18} color={COLORS.greenDark} />
              </View>
              <View style={community.scoreRuleCopy}>
                <Text style={community.scoreRuleTitle}>Flashcard reviews</Text>
                <Text style={community.scoreRuleText}>“Got it” earns 2 XP; “Still learning” earns 1 XP.</Text>
              </View>
            </View>
            <View style={community.scoreRule}>
              <View style={[community.scoreRuleIcon, community.scoreRuleIconRank]}>
                <Ionicons name="stats-chart-outline" size={18} color={COLORS.blue} />
              </View>
              <View style={community.scoreRuleCopy}>
                <Text style={community.scoreRuleTitle}>Rankings</Text>
                <Text style={community.scoreRuleText}>Daily and weekly rankings reset with their time period; All time keeps your full history.</Text>
              </View>
            </View>
          </View>
          <View style={community.scoreSystemNote}>
            <Text style={community.scoreSystemNoteText}>Social XP is one shared score: learning, flashcard practice, regular quizzes, and Omega Tests all add to it automatically.</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function CommunityScreen({
  onUnreadNudgesChange,
  initialCompetitiveMetric,
  onInitialCompetitiveMetricHandled,
  refreshTokens,
  onUseGoldenTicket,
}: {
  onUnreadNudgesChange?: (count: number) => void;
  initialCompetitiveMetric?: CompetitiveMetric | null;
  onInitialCompetitiveMetricHandled?: () => void;
  refreshTokens: number;
  onUseGoldenTicket: () => boolean;
}) {
  const reduceMotion = useReducedMotionPreference();
  const [section, setSection] = useState<CommunitySection>('leaderboard');
  const [period, setPeriod] = useState<CommunityPeriod>('weekly');
  const [leaderboardMode, setLeaderboardMode] = useState<'social' | 'collectors'>('social');
  const [collectorMetric, setCollectorMetric] = useState<CompetitiveMetric>(initialCompetitiveMetric ?? 'collectors');
  const [context, setContext] = useState<CommunityContext | null>(null);
  const [leaderboard, setLeaderboard] = useState<CommunityLeaderboardEntry[]>([]);
  const [collectorPeriod, setCollectorPeriod] = useState<WordCollectorPeriod>('week');
  const [collectorAudience, setCollectorAudience] = useState<WordCollectorAudience>('global');
  const [collectorContext, setCollectorContext] = useState<WordCollectorContext | null>(null);
  const [collectors, setCollectors] = useState<WordCollectorEntry[]>([]);
  const [collectorLoading, setCollectorLoading] = useState(false);
  const [collectorLoadingMore, setCollectorLoadingMore] = useState(false);
  const [collectorHasMore, setCollectorHasMore] = useState(true);
  const [collectorPage, setCollectorPage] = useState(0);
  const [collectorLocationPermission, setCollectorLocationPermission] = useState<WordCollectorLocationPermission | null>(null);
  const [collectorLocationLoading, setCollectorLocationLoading] = useState(false);
  const [collectorRankView, setCollectorRankView] = useState(false);
  const [socialXpExplainerOpen, setSocialXpExplainerOpen] = useState(false);
  const [socialXpSheetOpen, setSocialXpSheetOpen] = useState(false);
  const [connections, setConnections] = useState<CommunityConnection[]>([]);
  const [nudges, setNudges] = useState<CommunityNudge[]>([]);
  const [nudgeLoadingMore, setNudgeLoadingMore] = useState(false);
  const [nudgeHasMore, setNudgeHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardLoadingMore, setLeaderboardLoadingMore] = useState(false);
  const [leaderboardHasMore, setLeaderboardHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<CommunityLevel | null>(null);
  const [friendCode, setFriendCode] = useState('');
  const [profileName, setProfileName] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileSetupPromptVisible, setProfileSetupPromptVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(true);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [selectedLeaderboardEntry, setSelectedLeaderboardEntry] = useState<CommunityMemberEntry | null>(null);
  const [leaderboardActionLoading, setLeaderboardActionLoading] = useState(false);
  const [selectedNudgeRecipientId, setSelectedNudgeRecipientId] = useState<string | null>(null);
  const [nudgeRecipientSearch, setNudgeRecipientSearch] = useState('');
  const [selectedFriendForNudge, setSelectedFriendForNudge] = useState<CommunityConnection | null>(null);
  const [friendNudgeGroup, setFriendNudgeGroup] = useState<string | null>(null);
  const [friendNudgeSendingKey, setFriendNudgeSendingKey] = useState<string | null>(null);
  const [friendGoldenNudgeOpen, setFriendGoldenNudgeOpen] = useState(false);
  const [friendGoldenNudgeMessage, setFriendGoldenNudgeMessage] = useState('');
  const [friendGoldenNudgeSending, setFriendGoldenNudgeSending] = useState(false);
  const [friendPage, setFriendPage] = useState(0);
  const [friendSort, setFriendSort] = useState<FriendSort>('recent');
  const [nudgePage, setNudgePage] = useState(0);
  const [expandedNudgeCategory, setExpandedNudgeCategory] = useState<string | null>(null);
  const [nudgeComposerExpanded, setNudgeComposerExpanded] = useState(false);
  const [goldenNudgeComposerOpen, setGoldenNudgeComposerOpen] = useState(false);
  const [goldenNudgeMessage, setGoldenNudgeMessage] = useState('');
  const [goldenNudgeSending, setGoldenNudgeSending] = useState(false);

  const leaderboardCacheRef = useRef(new Map<string, CommunityLeaderboardEntry[]>());
  const collectorCacheRef = useRef(new Map<string, WordCollectorEntry[]>());
  const contextCacheRef = useRef(new Map<CommunityPeriod, CommunityContext>());
  const leaderboardRequestRef = useRef(0);
  const collectorRequestRef = useRef(0);
  const collectorSelectionRef = useRef(0);
  const leaderboardLoadMoreRef = useRef(false);
  const collectorLoadMoreRef = useRef(false);
  const nudgeLoadMoreRef = useRef(false);
  const initializedRef = useRef(false);
  const initialCompetitiveMetricHandledRef = useRef(false);
  const profileEntrance = useRef(new Animated.Value(0)).current;
  const leaderboardEntrance = useRef(new Animated.Value(0)).current;
  const collectorSparkleShimmer = useRef(new Animated.Value(0)).current;

  const applyContext = useCallback((nextContext: CommunityContext) => {
    setContext(nextContext);
    onUnreadNudgesChange?.(nextContext.unreadNudges);
    if (nextContext.profile) {
      setProfileName(nextContext.profile.displayName);
      setProfileVisible(nextContext.profile.profileVisible);
      setLeaderboardOptIn(nextContext.profile.leaderboardOptIn);
      setRequestsEnabled(nextContext.profile.friendRequestsEnabled);
      setNudgesEnabled(nextContext.profile.nudgesEnabled);
      setPushEnabled(nextContext.profile.pushNudgesEnabled);
    }
  }, [onUnreadNudgesChange]);

  const loadLeaderboard = useCallback(async (
    nextPeriod: CommunityPeriod,
    nextPage: number,
    nextLevel: CommunityLevel | null,
    force = false,
  ) => {
    const key = cacheKey(nextPeriod, nextPage, nextLevel);
    const cachedRows = leaderboardCacheRef.current.get(key);
    const cachedContext = contextCacheRef.current.get(nextPeriod);
    const request = ++leaderboardRequestRef.current;

    if (!force && cachedRows && cachedContext) {
      setLeaderboard(cachedRows);
      setLeaderboardHasMore(cachedRows.length === PAGE_SIZE);
      applyContext(cachedContext);
      return;
    }

    if (cachedRows) setLeaderboard(cachedRows);
    setLeaderboardLoadingMore(false);
    leaderboardLoadMoreRef.current = false;
    setLeaderboardLoading(true);
    try {
      const [nextContext, rows] = await Promise.all([
        force || !cachedContext ? getCommunityContext(nextPeriod) : Promise.resolve(cachedContext),
        force || !cachedRows
          ? getCommunityLeaderboard(nextPeriod, PAGE_SIZE, nextPage * PAGE_SIZE, nextLevel)
          : Promise.resolve(cachedRows),
      ]);
      if (request !== leaderboardRequestRef.current) return;
      contextCacheRef.current.set(nextPeriod, nextContext);
      leaderboardCacheRef.current.set(key, rows);
      applyContext(nextContext);
      setLeaderboard(rows);
      setLeaderboardHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      if (request === leaderboardRequestRef.current) {
          Alert.alert('Connect unavailable', error instanceof Error ? error.message : 'Please check your connection and try again.');
      }
    } finally {
      if (request === leaderboardRequestRef.current) setLeaderboardLoading(false);
    }
  }, [applyContext]);

  const refreshCommunity = useCallback(async () => {
    leaderboardCacheRef.current.clear();
    contextCacheRef.current.clear();
    const key = cacheKey(period, 0, selectedLevel);
    const request = ++leaderboardRequestRef.current;
    const [nextContext, nextConnections, nextNudges, rows] = await Promise.all([
      getCommunityContext(period),
      getCommunityConnections(),
      getCommunityNudges(NUDGE_FETCH_SIZE),
      getCommunityLeaderboard(period, PAGE_SIZE, 0, selectedLevel),
    ]);
    if (request !== leaderboardRequestRef.current) return;
    contextCacheRef.current.set(period, nextContext);
    leaderboardCacheRef.current.set(key, rows);
    applyContext(nextContext);
    setConnections(nextConnections);
    setNudges(nextNudges);
    setNudgeHasMore(nextNudges.length === NUDGE_FETCH_SIZE);
    setNudgePage(0);
    setPage(0);
    setLeaderboard(rows);
    setLeaderboardHasMore(rows.length === PAGE_SIZE);
  }, [applyContext, period, selectedLevel]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    let active = true;
    void (async () => {
      try {
        await refreshCommunity();
      } catch (error) {
        if (active) Alert.alert('Connect unavailable', error instanceof Error ? error.message : 'Please check your connection and try again.');
      } finally {
        if (active) setInitialLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshCommunity]);

  useEffect(() => {
    if (initialLoading || !context?.profile) return;
    profileEntrance.setValue(0);
    Animated.timing(profileEntrance, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [context?.profile, initialLoading, profileEntrance]);

  useEffect(() => {
    if (section !== 'leaderboard') return;
    leaderboardEntrance.setValue(0);
    Animated.timing(leaderboardEntrance, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [collectorMetric, collectorPeriod, collectors.length, leaderboard.length, leaderboardEntrance, leaderboardMode, period, section]);

  useEffect(() => {
    collectorSparkleShimmer.stopAnimation();
    collectorSparkleShimmer.setValue(0);
    if (leaderboardMode !== 'collectors') return;

    Animated.sequence([
      Animated.timing(collectorSparkleShimmer, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(collectorSparkleShimmer, {
        toValue: 0,
        duration: 420,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [collectorMetric, collectorSparkleShimmer, leaderboardMode]);

  const selectLeaderboard = useCallback((
    nextPeriod: CommunityPeriod,
    nextLevel: CommunityLevel | null = selectedLevel,
  ) => {
    const nextPage = 0;
    setPeriod(nextPeriod);
    setPage(nextPage);
    setSelectedLevel(nextLevel);
    const cachedRows = leaderboardCacheRef.current.get(cacheKey(nextPeriod, nextPage, nextLevel));
    const cachedContext = contextCacheRef.current.get(nextPeriod);
    if (cachedRows) setLeaderboard(cachedRows);
    else setLeaderboard([]);
    if (cachedContext) applyContext(cachedContext);
    void loadLeaderboard(nextPeriod, nextPage, nextLevel);
  }, [applyContext, loadLeaderboard, selectedLevel]);

  const returnToMainLeaderboard = useCallback(() => {
    setSection('leaderboard');
    setLeaderboardMode('social');
    setCollectorRankView(false);
    selectLeaderboard(period, null);
  }, [period, selectLeaderboard]);

  const loadMoreLeaderboard = useCallback(async () => {
    if (leaderboardLoading || leaderboardLoadingMore || !leaderboardHasMore || leaderboardLoadMoreRef.current) return;
    leaderboardLoadMoreRef.current = true;
    const nextPage = page + 1;
    const nextPeriod = period;
    const nextLevel = selectedLevel;
    const key = cacheKey(nextPeriod, nextPage, nextLevel);
    const request = ++leaderboardRequestRef.current;
    setLeaderboardLoadingMore(true);

    try {
      const rows = leaderboardCacheRef.current.get(key)
        ?? await getCommunityLeaderboard(nextPeriod, PAGE_SIZE, nextPage * PAGE_SIZE, nextLevel);
      if (request !== leaderboardRequestRef.current) return;
      leaderboardCacheRef.current.set(key, rows);
      setLeaderboard((current) => {
        const known = new Set(current.map((entry) => entry.publicId));
        return [...current, ...rows.filter((entry) => !known.has(entry.publicId))];
      });
      setPage(nextPage);
      setLeaderboardHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      if (request === leaderboardRequestRef.current) {
        Alert.alert('More learners unavailable', error instanceof Error ? error.message : 'Please try again shortly.');
      }
    } finally {
      if (request === leaderboardRequestRef.current) setLeaderboardLoadingMore(false);
      leaderboardLoadMoreRef.current = false;
    }
  }, [leaderboardHasMore, leaderboardLoading, leaderboardLoadingMore, page, period, selectedLevel]);

  const loadWordCollectors = useCallback(async (
    nextPeriod: WordCollectorPeriod,
    nextAudience: WordCollectorAudience,
    nextPage: number,
    force = false,
    nextMetric: CompetitiveMetric = collectorMetric,
  ) => {
    const key = wordCollectorCacheKey(nextMetric, nextPeriod, nextAudience, nextPage);
    const cachedRows = collectorCacheRef.current.get(key);
    const request = ++collectorRequestRef.current;
    setCollectorLoadingMore(false);
    collectorLoadMoreRef.current = false;
    setCollectorLoading(true);
    setCollectorContext(null);
    setCollectors([]);
    setCollectorPage(nextPage);
    setCollectorHasMore(false);
    try {
      const nextContext = await getCompetitiveMetricContext(nextMetric, nextPeriod, nextAudience);
      if (request !== collectorRequestRef.current) return;
      setCollectorContext(nextContext);

      if ((nextAudience === 'nearby' || nextAudience === 'state' || nextAudience === 'all') && !nextContext.hasLocation) {
        // Selecting a location-based audience only changes the view. Keep all
        // native location calls behind the explicit Enable Location action so
        // a stale permission/module state cannot take down the screen.
        const permission = await getWordCollectorLocationPermission().catch(
          (): WordCollectorLocationPermission => 'undetermined',
        );
        if (request !== collectorRequestRef.current) return;
        setCollectorLocationPermission(permission);
        setCollectors([]);
        setCollectorHasMore(false);
        return;
      }

      const rows = !force && cachedRows
        ? cachedRows
        : await getCompetitiveMetricLeaderboard(nextMetric, nextPeriod, nextAudience, PAGE_SIZE, nextPage * PAGE_SIZE);
      if (request !== collectorRequestRef.current) return;
      collectorCacheRef.current.set(key, rows);
      setCollectors(rows);
      setCollectorHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      if (request === collectorRequestRef.current) {
        Alert.alert('Word Collectors unavailable', error instanceof Error ? error.message : 'Please check your connection and try again.');
      }
    } finally {
      if (request === collectorRequestRef.current) setCollectorLoading(false);
    }
  }, [collectorMetric]);

  useEffect(() => {
    if (
      !initialCompetitiveMetric ||
      initialLoading ||
      !context?.profile ||
      initialCompetitiveMetricHandledRef.current
    ) return;

    initialCompetitiveMetricHandledRef.current = true;
    setSection('leaderboard');
    setLeaderboardMode('collectors');
    setSelectedLevel(null);
    setCollectorMetric(initialCompetitiveMetric);
    const nextPeriod: WordCollectorPeriod = initialCompetitiveMetric === 'retention' ? 'all_time' : 'week';
    setCollectorPeriod(nextPeriod);
    setCollectorRankView(false);
    void loadWordCollectors(nextPeriod, collectorAudience, 0, true, initialCompetitiveMetric);
    onInitialCompetitiveMetricHandled?.();
  }, [
    collectorAudience,
    context?.profile,
    initialCompetitiveMetric,
    initialLoading,
    loadWordCollectors,
    onInitialCompetitiveMetricHandled,
  ]);

  const selectWordCollectorAudience = useCallback((nextAudience: WordCollectorAudience) => {
    collectorSelectionRef.current += 1;
    setCollectorAudience(nextAudience);
    setCollectorPage(0);
    setCollectorRankView(false);
    setCollectorLocationLoading(false);
    if (nextAudience === 'global') {
      setCollectorLocationPermission(null);
      void loadWordCollectors(collectorPeriod, nextAudience, 0);
      return;
    }
    void loadWordCollectors(collectorPeriod, nextAudience, 0, true);
  }, [collectorPeriod, loadWordCollectors]);

  const enableCollectorLocation = useCallback(async () => {
    const selection = collectorSelectionRef.current;
    setCollectorLocationLoading(true);
    try {
      const result = await enableWordCollectorLocation();
      if (selection !== collectorSelectionRef.current) return;
      if (result === 'ready') {
        collectorCacheRef.current.clear();
        setCollectorLocationPermission('granted');
        void loadWordCollectors(collectorPeriod, collectorAudience, 0, true);
      } else if (result === 'denied') {
        setCollectorLocationPermission('denied');
      } else {
        Alert.alert('Location unavailable', 'Turn on Location Services and try again to view this ranking.');
      }
    } catch (error) {
      if (selection === collectorSelectionRef.current) {
        Alert.alert('Location unavailable', error instanceof Error ? error.message : 'Try again when your device location is available.');
      }
    } finally {
      if (selection === collectorSelectionRef.current) setCollectorLocationLoading(false);
    }
  }, [collectorAudience, collectorPeriod, loadWordCollectors]);

  const loadMoreWordCollectors = useCallback(async () => {
    if (collectorLoading || collectorLoadingMore || !collectorHasMore || collectorLoadMoreRef.current || collectorRankView) return;
    collectorLoadMoreRef.current = true;
    const nextPage = collectorPage + 1;
    const key = wordCollectorCacheKey(collectorMetric, collectorPeriod, collectorAudience, nextPage);
    const request = ++collectorRequestRef.current;
    setCollectorLoadingMore(true);
    try {
      const rows = collectorCacheRef.current.get(key)
        ?? await getCompetitiveMetricLeaderboard(collectorMetric, collectorPeriod, collectorAudience, PAGE_SIZE, nextPage * PAGE_SIZE);
      if (request !== collectorRequestRef.current) return;
      collectorCacheRef.current.set(key, rows);
      setCollectors((current) => {
        const known = new Set(current.map((entry) => entry.publicId));
        return [...current, ...rows.filter((entry) => !known.has(entry.publicId))];
      });
      setCollectorPage(nextPage);
      setCollectorHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      if (request === collectorRequestRef.current) {
        Alert.alert('More collectors unavailable', error instanceof Error ? error.message : 'Please try again shortly.');
      }
    } finally {
      if (request === collectorRequestRef.current) setCollectorLoadingMore(false);
      collectorLoadMoreRef.current = false;
    }
  }, [collectorAudience, collectorHasMore, collectorLoading, collectorLoadingMore, collectorMetric, collectorPage, collectorPeriod, collectorRankView]);

  const showMyCollectorRank = useCallback(async () => {
    try {
      const rows = await getCompetitiveMetricMyRank(collectorMetric, collectorPeriod, collectorAudience);
      if (!rows.length) {
        Alert.alert(
          collectorMetric === 'retention' ? 'Keep reviewing' : collectorMetric === 'streaks' ? 'Complete your daily goal' : 'Start discovering words',
          collectorMetric === 'retention'
            ? 'Complete enough meaningful reviews to qualify for the Retention ranking.'
            : collectorMetric === 'streaks'
              ? 'Complete today’s Learning Goal to start a streak and appear in this ranking.'
              : 'Add a new word and it will appear in your Word Collector total.',
        );
        return;
      }
      setCollectors(rows);
      setCollectorRankView(true);
      setCollectorHasMore(false);
    } catch (error) {
      Alert.alert('My Rank unavailable', error instanceof Error ? error.message : 'Please try again shortly.');
    }
  }, [collectorAudience, collectorMetric, collectorPeriod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCommunity();
      if (leaderboardMode === 'collectors') {
        collectorCacheRef.current.clear();
        setCollectorRankView(false);
        await loadWordCollectors(collectorPeriod, collectorAudience, 0, true);
      }
    } catch (error) {
      Alert.alert('Could not refresh Connect', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [collectorAudience, collectorPeriod, leaderboardMode, loadWordCollectors, refreshCommunity]);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await setupCommunityProfile({
        displayName: profileName,
        profileVisible,
        leaderboardOptIn,
        friendRequestsEnabled: requestsEnabled,
        nudgesEnabled,
        pushNudgesEnabled: pushEnabled,
      });
      if (pushEnabled) {
        try {
          const token = await getCommunityExpoPushToken();
          await registerCommunityPushToken(token);
        } catch {
          setPushEnabled(false);
          await deactivateCommunityPushTokens().catch(() => undefined);
          await setupCommunityProfile({
            displayName: profileName,
            profileVisible,
            leaderboardOptIn,
            friendRequestsEnabled: requestsEnabled,
            nudgesEnabled,
            pushNudgesEnabled: false,
          });
          Alert.alert('Push nudges are off', 'You can still receive nudges in Community. Enable notifications in Settings to receive them on your device.');
        }
      } else {
        // Keep the server-side device list aligned with the learner's choice.
        await deactivateCommunityPushTokens().catch(() => undefined);
      }
      await refreshCommunity();
      setIsEditingProfile(false);
    } catch (error) {
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }, [leaderboardOptIn, nudgesEnabled, profileName, profileVisible, pushEnabled, refreshCommunity, requestsEnabled]);

  const addFriend = useCallback(async () => {
    try {
      await sendCommunityFriendRequest(friendCode);
      setFriendCode('');
      await refreshCommunity();
      Alert.alert('Request sent', 'Your friend will see it in Community.');
    } catch (error) {
      Alert.alert('Could not send request', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [friendCode, refreshCommunity]);

  const openFriendNudgePicker = useCallback((friend: CommunityConnection) => {
    setFriendNudgeGroup(null);
    setFriendNudgeSendingKey(null);
    setFriendGoldenNudgeOpen(false);
    setFriendGoldenNudgeMessage('');
    setFriendGoldenNudgeSending(false);
    setSelectedFriendForNudge(friend);
  }, []);

  const closeFriendNudgePicker = useCallback(() => {
    if (friendNudgeSendingKey || friendGoldenNudgeSending) return;
    setSelectedFriendForNudge(null);
    setFriendNudgeGroup(null);
    setFriendGoldenNudgeOpen(false);
    setFriendGoldenNudgeMessage('');
  }, [friendGoldenNudgeSending, friendNudgeSendingKey]);

  const sendFriendNudge = useCallback(async (option: NudgeOption) => {
    if (!selectedFriendForNudge || friendNudgeSendingKey || friendGoldenNudgeSending) return;
    const friendName = selectedFriendForNudge.displayName;
    setFriendNudgeSendingKey(option.key);
    try {
      await sendCommunityNudge(selectedFriendForNudge.publicId, option.type, option.key);
      setSelectedFriendForNudge(null);
      setFriendNudgeGroup(null);
      Alert.alert('Nudge sent', `${option.title} was sent to ${friendName}.`);
    } catch (error) {
      Alert.alert('Could not send nudge', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setFriendNudgeSendingKey(null);
    }
  }, [friendGoldenNudgeSending, friendNudgeSendingKey, selectedFriendForNudge]);

  const sendFriendGoldenNudge = useCallback(async () => {
    const message = friendGoldenNudgeMessage.trim();
    if (!selectedFriendForNudge || friendGoldenNudgeSending) return;
    if (refreshTokens < 1) {
      Alert.alert('No Golden Tickets yet', 'Unlock achievements to earn a Golden Ticket for a one-of-a-kind nudge.');
      return;
    }
    if (!message) {
      Alert.alert('Write a message first', 'Add a personal message for your friend.');
      return;
    }
    if (message.length > GOLDEN_NUDGE_MAX_LENGTH) return;

    const friendName = selectedFriendForNudge.displayName;
    setFriendGoldenNudgeSending(true);
    try {
      await sendCommunityNudge(selectedFriendForNudge.publicId, 'golden_nudge', 'golden_custom', message);
      onUseGoldenTicket();
      setFriendGoldenNudgeMessage('');
      setFriendGoldenNudgeOpen(false);
      setFriendNudgeGroup(null);
      setSelectedFriendForNudge(null);
      Alert.alert('Golden nudge sent', `Your message was sent to ${friendName}.`);
    } catch (error) {
      Alert.alert('Could not send Golden Nudge', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setFriendGoldenNudgeSending(false);
    }
  }, [friendGoldenNudgeMessage, friendGoldenNudgeSending, onUseGoldenTicket, refreshTokens, selectedFriendForNudge]);

  const sendLeaderboardNudge = useCallback(async (option: NudgeOption) => {
    if (!selectedLeaderboardEntry) return;
    setLeaderboardActionLoading(true);
    try {
      await sendCommunityNudge(selectedLeaderboardEntry.publicId, option.type, option.key);
      setSelectedLeaderboardEntry(null);
      Alert.alert('Nudge sent', `${option.title} was sent to ${selectedLeaderboardEntry.displayName}.`);
    } catch (error) {
      Alert.alert('Could not send nudge', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setLeaderboardActionLoading(false);
    }
  }, [selectedLeaderboardEntry]);

  const addLeaderboardFriend = useCallback(async () => {
    if (!selectedLeaderboardEntry) return;
    setLeaderboardActionLoading(true);
    try {
      await sendCommunityFriendRequestByPublicId(selectedLeaderboardEntry.publicId);
      await refreshCommunity();
      setSelectedLeaderboardEntry(null);
      Alert.alert('Request sent', `${selectedLeaderboardEntry.displayName} will see your connection request.`);
    } catch (error) {
      Alert.alert('Could not send request', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLeaderboardActionLoading(false);
    }
  }, [refreshCommunity, selectedLeaderboardEntry]);

  const blockLeaderboardMember = useCallback(async () => {
    if (!selectedLeaderboardEntry) return;
    setLeaderboardActionLoading(true);
    try {
      await removeOrBlockCommunityConnection(selectedLeaderboardEntry.publicId, true);
      await refreshCommunity();
      setSelectedLeaderboardEntry(null);
      Alert.alert('User blocked', `${selectedLeaderboardEntry.displayName} can no longer connect with or nudge you.`);
    } catch (error) {
      Alert.alert('Could not block user', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLeaderboardActionLoading(false);
    }
  }, [refreshCommunity, selectedLeaderboardEntry]);

  const updateAvatar = useCallback(async () => {
    if (!context?.profile || avatarUpdating) return;
    setAvatarUpdating(true);
    try {
      const uploaded = await pickAndUploadCommunityAvatar();
      if (uploaded) {
        // Show the confirmed storage path immediately. A background refresh
        // should not make a successful upload look like it failed if another
        // Community request is temporarily unavailable.
        setContext((current) => current?.profile
          ? { ...current, profile: { ...current.profile, avatarPath: uploaded } }
          : current);
        await refreshCommunity().catch(() => undefined);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Create your Connect profile before adding a picture.') {
        setContext((current) => (current ? { ...current, profile: null } : current));
        setIsEditingProfile(false);
        setProfileSetupPromptVisible(true);
        return;
      }
      Alert.alert('Could not update picture', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setAvatarUpdating(false);
    }
  }, [avatarUpdating, context?.profile, refreshCommunity]);

  const runConnectionAction = useCallback(async (action: () => Promise<void>, title: string) => {
    try {
      await action();
      await refreshCommunity();
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : 'Please try again.');
    }
  }, [refreshCommunity]);

  const reportLeaderboardMember = useCallback(async (reason: 'harassment' | 'spam' | 'inappropriate_name' | 'inappropriate_avatar' | 'other') => {
    if (!selectedLeaderboardEntry) return;
    setLeaderboardActionLoading(true);
    try {
      await reportCommunityUser(selectedLeaderboardEntry.publicId, reason);
      setSelectedLeaderboardEntry(null);
      Alert.alert('Report submitted', 'Thanks for helping keep Connect welcoming.');
    } catch (error) {
      Alert.alert('Could not submit report', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLeaderboardActionLoading(false);
    }
  }, [selectedLeaderboardEntry]);

  const openProfileEditor = useCallback(() => {
    if (!context?.profile) return;
    setProfileName(context.profile.displayName);
    setProfileVisible(context.profile.profileVisible);
    setLeaderboardOptIn(context.profile.leaderboardOptIn);
    setRequestsEnabled(context.profile.friendRequestsEnabled);
    setNudgesEnabled(context.profile.nudgesEnabled);
    setPushEnabled(context.profile.pushNudgesEnabled);
    setIsEditingProfile(true);
    setContext(null);
  }, [context?.profile]);

  const selectedConnection = selectedLeaderboardEntry
    ? connections.find((connection) => connection.publicId === selectedLeaderboardEntry.publicId)
    : undefined;
  const selectedTier = selectedLeaderboardEntry && isCommunityLeaderboardEntry(selectedLeaderboardEntry)
    ? levelPresentation(selectedLeaderboardEntry.level)
    : null;
  const selectedCollectorEntry = selectedLeaderboardEntry && !isCommunityLeaderboardEntry(selectedLeaderboardEntry)
    ? selectedLeaderboardEntry
    : null;
  const selectedCollectorMetric = selectedCollectorEntry
    ? COMPETITIVE_METRICS.find((item) => item.key === collectorMetric) ?? COMPETITIVE_METRICS[0]
    : null;
  const orderedConnections = useMemo(() => {
    if (friendSort === 'recent') {
      return [...connections].sort((left, right) => {
        const leftTime = Date.parse(left.addedAt ?? '');
        const rightTime = Date.parse(right.addedAt ?? '');
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      });
    }
    return [...connections].sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' }));
  }, [connections, friendSort]);
  const nudgeRecipients = orderedConnections.filter((connection) => connection.status === 'accepted');
  const normalizedNudgeRecipientSearch = nudgeRecipientSearch.trim().toLowerCase();
  const visibleNudgeRecipients = nudgeRecipients.filter((friend) => (
    !normalizedNudgeRecipientSearch || friend.displayName.toLowerCase().includes(normalizedNudgeRecipientSearch)
  ));
  const selectedNudgeRecipient = visibleNudgeRecipients.find((friend) => friend.publicId === selectedNudgeRecipientId) ?? visibleNudgeRecipients[0];
  const friendPageCount = Math.ceil(orderedConnections.length / PAGE_SIZE);
  const nudgePageCount = Math.ceil(nudges.length / PAGE_SIZE);
  const activeFriendPage = Math.min(friendPage, Math.max(0, friendPageCount - 1));
  const activeNudgePage = Math.min(nudgePage, Math.max(0, nudgePageCount - 1));
  const visibleConnections = orderedConnections.slice(activeFriendPage * PAGE_SIZE, (activeFriendPage + 1) * PAGE_SIZE);
  const visibleNudges = nudges.slice(activeNudgePage * PAGE_SIZE, (activeNudgePage + 1) * PAGE_SIZE);

  const openFriendSortMenu = useCallback(() => {
    Alert.alert('Sort friends', undefined, [
      { text: FRIEND_SORT_LABELS.recent, onPress: () => { setFriendSort('recent'); setFriendPage(0); } },
      { text: FRIEND_SORT_LABELS.alphabetical, onPress: () => { setFriendSort('alphabetical'); setFriendPage(0); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const loadMoreNudges = useCallback(async () => {
    if (nudgeLoadingMore || !nudgeHasMore || nudgeLoadMoreRef.current) return;
    nudgeLoadMoreRef.current = true;
    setNudgeLoadingMore(true);
    try {
      const nextNudges = await getCommunityNudges(NUDGE_FETCH_SIZE, nudges.length);
      setNudges((current) => {
        const known = new Set(current.map((nudge) => nudge.id));
        return [...current, ...nextNudges.filter((nudge) => !known.has(nudge.id))];
      });
      setNudgeHasMore(nextNudges.length === NUDGE_FETCH_SIZE);
    } catch (error) {
      Alert.alert('Could not load older nudges', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setNudgeLoadingMore(false);
      nudgeLoadMoreRef.current = false;
    }
  }, [nudgeHasMore, nudgeLoadingMore, nudges.length]);

  const sendNudgeFromInbox = useCallback(async (option: NudgeOption) => {
    if (!selectedNudgeRecipient) {
      Alert.alert('Connect with a friend first', 'Once you are connected, choose them here and send any of these friendly nudges.');
      return;
    }
    try {
      await sendCommunityNudge(selectedNudgeRecipient.publicId, option.type, option.key);
      Alert.alert('Nudge sent', `${option.title} was sent to ${selectedNudgeRecipient.displayName}.`);
    } catch (error) {
      Alert.alert('Could not send nudge', error instanceof Error ? error.message : 'Please try again later.');
    }
  }, [selectedNudgeRecipient]);

  const openGoldenNudgeComposer = useCallback(() => {
    if (goldenNudgeComposerOpen) {
      setGoldenNudgeComposerOpen(false);
      return;
    }
    if (!selectedNudgeRecipient) {
      Alert.alert('Connect with a friend first', 'Once you are connected, choose them here and send a Golden Nudge.');
      return;
    }
    if (refreshTokens < 1) {
      Alert.alert('No Golden Tickets yet', 'Unlock achievements to earn a Golden Ticket for a one-of-a-kind nudge.');
      return;
    }
    setGoldenNudgeComposerOpen(true);
  }, [goldenNudgeComposerOpen, refreshTokens, selectedNudgeRecipient]);

  const sendGoldenNudge = useCallback(async () => {
    const message = goldenNudgeMessage.trim();
    if (!selectedNudgeRecipient) {
      Alert.alert('Connect with a friend first', 'Choose a connected friend before sending a Golden Nudge.');
      return;
    }
    if (refreshTokens < 1) {
      Alert.alert('No Golden Tickets yet', 'Unlock achievements to earn another Golden Ticket.');
      return;
    }
    if (!message) {
      Alert.alert('Write a message first', 'Add a personal message for your friend.');
      return;
    }
    if (message.length > GOLDEN_NUDGE_MAX_LENGTH) return;

    setGoldenNudgeSending(true);
    try {
      await sendCommunityNudge(selectedNudgeRecipient.publicId, 'golden_nudge', 'golden_custom', message);
      onUseGoldenTicket();
      setGoldenNudgeMessage('');
      setGoldenNudgeComposerOpen(false);
      Alert.alert('Golden nudge sent', `Your message was sent to ${selectedNudgeRecipient.displayName}.`);
    } catch (error) {
      Alert.alert('Could not send Golden Nudge', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setGoldenNudgeSending(false);
    }
  }, [goldenNudgeMessage, onUseGoldenTicket, refreshTokens, selectedNudgeRecipient]);

  const renderSocialPagination = (currentPage: number, pageCount: number, onChange: (page: number) => void) => {
    if (pageCount <= 1) return null;
    return (
      <View style={community.pagination}>
        <Pressable disabled={currentPage === 0} onPress={() => onChange(Math.max(0, currentPage - 1))}>
          <Text style={[community.pageLink, currentPage === 0 && community.disabled]}>Previous</Text>
        </Pressable>
        <Text style={community.pageLabel}>Page {currentPage + 1} of {pageCount}</Text>
        <Pressable disabled={currentPage >= pageCount - 1} onPress={() => onChange(Math.min(pageCount - 1, currentPage + 1))}>
          <Text style={[community.pageLink, currentPage >= pageCount - 1 && community.disabled]}>Next</Text>
        </Pressable>
      </View>
    );
  };

  const leaderboardPlacementStyle = (rank: number | null | undefined, level?: CommunityLevel) => {
    switch (leaderboardPlacementFor(rank, level)) {
      case 'champion': return community.rankRowChampion;
      case 'gold': return community.rankRowGold;
      case 'silver': return community.rankRowSilver;
      case 'bronze': return community.rankRowBronze;
      default: return undefined;
    }
  };

  const renderWordCollectorsHero = () => {
    const metric = COMPETITIVE_METRICS.find((item) => item.key === collectorMetric) ?? COMPETITIVE_METRICS[0];
    const copy = collectorMetric === 'retention'
      ? 'Remember what you learn. Accuracy and meaningful review volume both count.'
      : collectorMetric === 'streaks'
        ? 'Show up consistently. Your current Learning Streak leads the way.'
        : 'Build your vocabulary. Every meaningful word added moves you forward.';

    return (
      <View style={[community.collectorHero, { borderColor: `${metric.color}45`, backgroundColor: metric.background }]}>
        <View style={community.collectorHeroHeading}>
          <View style={[community.collectorHeroIcon, { backgroundColor: `${metric.color}20` }]}>
            <Ionicons name={metric.icon} size={23} color={metric.color} />
          </View>
          <View style={community.collectorHeroCopy}>
            <Text style={[community.collectorHeroEyebrow, { color: metric.color }]}>{metric.label.toUpperCase()}</Text>
            <Text style={community.collectorHeroTitle}>{copy}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Return to main leaderboard"
          accessibilityHint="Shows the Connect leaderboard with all levels"
          onPress={returnToMainLeaderboard}
          style={({ pressed }) => [community.collectorBackButton, pressed && community.collectorBackButtonPressed]}
        >
          <Ionicons name="arrow-back" size={15} color={COLORS.purpleDark} />
          <Text style={community.collectorBackButtonText}>Back to leaderboard</Text>
        </Pressable>
      </View>
    );
  };

  const renderWordCollectors = () => {
    const metric = COMPETITIVE_METRICS.find((item) => item.key === collectorMetric) ?? COMPETITIVE_METRICS[0];
    const locationRequired = collectorAudience === 'nearby' || collectorAudience === 'state' || collectorAudience === 'all';
    const locationAudienceLabel = collectorAudience === 'state' ? 'State' : collectorAudience === 'all' ? 'Country' : 'Nearby';
    const locationAudienceDescription = collectorAudience === 'state'
      ? 'Allow WordWiz to use your approximate location to place you in a broad state leaderboard. Your exact location is never shown.'
      : collectorAudience === 'all'
        ? 'Allow WordWiz to use your approximate location to place you in a country leaderboard. Your exact location is never shown.'
        : 'Allow WordWiz to use your approximate location to place you in a broad local leaderboard. Your exact location is never shown.';
    const locationGroupIsGrowing = locationRequired && !collectorLoading && collectors.length === 0;
    const noCollectorWords = !collectorLoading && !locationRequired && collectors.length === 0;
    const collectorContextLoading = collectorLoading && !collectorContext;
    const showLocationAccess = !collectorLoading && locationRequired && !collectorContext?.hasLocation;
    const metricLabel = collectorMetric === 'retention' ? 'RETENTION' : collectorMetric === 'streaks' ? 'LEARNING STREAK' : 'WORDS ADDED';
    const rankTitle = collectorMetric === 'retention' ? 'YOUR RETENTION RANK' : collectorMetric === 'streaks' ? 'YOUR LEARNING STREAK RANK' : 'YOUR WORD COLLECTOR RANK';
    const metricDetail = collectorMetric === 'retention'
      ? collectorContext?.qualified
        ? `${retentionReviewBreakdownText(collectorContext)} · ${collectorContext.retentionPercent ?? 0}% retained`
        : `Complete ${collectorContext?.reviewsToQualify ?? 40} more reviews to qualify`
      : collectorMetric === 'streaks'
        ? `${Math.max(0, Math.round(collectorContext?.streakDays ?? 0))} Learning Streak days in a row`
        : collectorContext?.wordCount
          ? `${collectorContext.wordCount.toLocaleString()} ${collectorContext.wordCount === 1 ? 'word' : 'words'} added`
          : 'Add a new word to join this ranking.';

    return (
      <>
        <View style={community.metricTabs} accessibilityRole="tablist">
          {COMPETITIVE_METRICS.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: collectorMetric === item.key }}
              onPress={() => {
                collectorSelectionRef.current += 1;
                setCollectorMetric(item.key);
                setCollectorPeriod(item.key === 'retention' ? 'all_time' : 'week');
                setCollectorPage(0);
                setCollectorRankView(false);
                void loadWordCollectors(item.key === 'retention' ? 'all_time' : 'week', collectorAudience, 0, true, item.key);
              }}
              style={({ pressed }) => [
                community.metricTab,
                collectorMetric === item.key && community.metricTabActive,
                collectorMetric === 'streaks' && item.key === 'streaks' && community.metricTabActiveStreak,
                pressed && community.metricTabPressed,
              ]}
            >
              <Ionicons name={item.icon} size={16} color={collectorMetric === item.key ? item.color : COLORS.muted} />
              <Text style={[community.metricTabText, collectorMetric === item.key && { color: item.color }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        {collectorMetric !== 'streaks' ? <View style={community.collectorControlGroup}>
          <Text style={community.collectorControlLabel}>{collectorMetric === 'retention' ? 'RETENTION WINDOW' : metricLabel}</Text>
          <View style={community.periods}>
            {WORD_COLLECTOR_PERIODS.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: collectorPeriod === item }}
                onPress={() => {
                  collectorSelectionRef.current += 1;
                  setCollectorPeriod(item);
                  setCollectorPage(0);
                  setCollectorRankView(false);
                  setCollectorLocationLoading(false);
                  void loadWordCollectors(item, collectorAudience, 0);
                }}
                style={[community.segment, collectorPeriod === item && community.segmentActive]}
              >
                <Text style={[community.segmentText, collectorPeriod === item && community.segmentTextActive]}>{WORD_COLLECTOR_PERIOD_LABELS[item]}</Text>
              </Pressable>
            ))}
          </View>
        </View> : null}

        <View style={community.collectorControlGroup}>
          <Text style={community.collectorControlLabel}>COMPETE WITH</Text>
          <View style={community.collectorAudienceRow}>
            {WORD_COLLECTOR_AUDIENCES.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: collectorAudience === item }}
                onPress={() => void selectWordCollectorAudience(item)}
                style={[community.collectorAudience, collectorAudience === item && community.collectorAudienceActive]}
              >
                <Text style={[community.collectorAudienceText, collectorAudience === item && community.collectorAudienceTextActive]}>{WORD_COLLECTOR_AUDIENCE_LABELS[item]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {collectorContextLoading ? (
          <View style={community.collectorMyRankLoadingCard} accessibilityLabel={`Loading ${metric.label.toLowerCase()} rank`}>
            <View style={community.collectorMyRankLoadingCopy}>
              <Text style={community.myLeaderboardEyebrow}>UPDATING YOUR RANK</Text>
              <Text style={community.collectorLoadingTitle}>Loading your {metric.label.toLowerCase()} rank…</Text>
              <Text style={community.collectorLoadingDetail}>Fetching the latest ranking.</Text>
            </View>
            <ActivityIndicator size="small" color={metric.color} />
          </View>
        ) : (
          <View style={community.collectorMyRankCard}>
            <View style={community.collectorMyRankCopy}>
              <Text style={community.myLeaderboardEyebrow}>{rankTitle}</Text>
              <Text numberOfLines={1} style={community.collectorMyRankValue}>
                {collectorContext?.rank ? `#${collectorContext.rank}` : 'Not ranked yet'}
              </Text>
              <Text numberOfLines={2} ellipsizeMode="tail" style={community.collectorMyRankDetail}>{metricDetail}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show my ${metric.label} rank`}
              disabled={!collectorContext?.rank}
              onPress={() => void showMyCollectorRank()}
              style={[community.collectorMyRankButton, !collectorContext?.rank && community.disabledButton]}
            >
              <Text style={community.collectorMyRankButtonText}>My Rank</Text>
            </Pressable>
          </View>
        )}

        {!collectorContextLoading && !collectorContext?.eligible ? (
          <View style={community.notice}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.purpleDark} />
            <Text style={community.noticeText}>Turn on leaderboard visibility in your Connect profile to join {metric.label}. Your saved words stay private.</Text>
          </View>
        ) : null}

        {collectorMetric === 'retention' && collectorContext?.eligible && !collectorContext.qualified ? (
          <View style={community.retentionQualificationCard}>
            <View style={community.retentionQualificationIcon}>
              <Ionicons name="bulb-outline" size={18} color={COLORS.purpleDark} />
            </View>
            <View style={community.retentionQualificationCopy}>
              <Text style={community.retentionQualificationTitle}>Retention Rank unlocks with evidence</Text>
              <Text style={community.retentionQualificationText}>Complete {collectorContext.reviewsToQualify ?? 40} more reviews. Ranking considers accuracy and meaningful review volume.</Text>
            </View>
          </View>
        ) : null}

        {showLocationAccess ? (
          <View style={community.collectorLocationCard}>
            <View style={community.collectorLocationIcon}>
              <Ionicons name="location-outline" size={21} color={COLORS.blue} />
            </View>
            <View style={community.collectorLocationCopy}>
              <Text style={community.collectorLocationTitle}>
                {collectorLocationPermission === 'denied'
                  ? `${locationAudienceLabel} rankings need location access`
                  : collectorAudience === 'state' ? 'See how you rank in your state' : collectorAudience === 'all' ? 'See how you rank in your country' : 'See how you rank nearby'}
              </Text>
              <Text style={community.collectorLocationText}>{locationAudienceDescription}</Text>
            </View>
            <View style={community.collectorLocationActions}>
              {collectorLocationPermission === 'denied' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open Settings to enable ${locationAudienceLabel.toLowerCase()} rankings`}
                  onPress={() => { void Linking.openSettings(); }}
                  style={community.collectorLocationPrimary}
                >
                  <Text style={community.collectorLocationPrimaryText}>Open Settings</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Enable location for ${locationAudienceLabel.toLowerCase()} rankings`}
                  disabled={collectorLocationLoading}
                  onPress={() => void enableCollectorLocation()}
                  style={[community.collectorLocationPrimary, collectorLocationLoading && community.disabledButton]}
                >
                  {collectorLocationLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={community.collectorLocationPrimaryText}>Enable Location</Text>}
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Continue with global rankings"
                onPress={() => void selectWordCollectorAudience('global')}
                style={community.collectorLocationSecondary}
              >
                <Text style={community.collectorLocationSecondaryText}>Not Now</Text>
              </Pressable>
            </View>
          </View>
        ) : locationGroupIsGrowing ? (
          <View style={community.empty}>
            <Ionicons name="people-outline" size={30} color={COLORS.purple} />
            <Text style={community.emptyTitle}>Your local ranking is still growing</Text>
            <Text style={community.emptyText}>Try State or Global while more learners join your general area.</Text>
            <View style={community.collectorEmptyActions}>
              <Pressable onPress={() => void selectWordCollectorAudience('state')} style={community.collectorEmptyButton}><Text style={community.collectorEmptyButtonText}>View State</Text></Pressable>
              <Pressable onPress={() => void selectWordCollectorAudience('global')} style={community.collectorEmptyButton}><Text style={community.collectorEmptyButtonText}>View Global</Text></Pressable>
            </View>
          </View>
        ) : (
          <Animated.View
            style={{
              opacity: leaderboardEntrance,
              transform: [{ translateY: leaderboardEntrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
          >
            <View style={community.leaderboardStatus}>
              <Text style={community.leaderboardStatusText}>
              {collectorRankView ? 'Your place in this ranking' : `${collectorMetric === 'streaks' ? 'Current Learning Streak' : WORD_COLLECTOR_PERIOD_LABELS[collectorPeriod]} · ${WORD_COLLECTOR_AUDIENCE_LABELS[collectorAudience]} ${metric.label}`}
              </Text>
              {collectorLoading ? <ActivityIndicator size="small" color={COLORS.purple} /> : null}
            </View>
            {collectorContextLoading ? (
              <View style={community.collectorLoadingRows} accessibilityLabel={`Loading ${metric.label.toLowerCase()} leaderboard`}>
                {[0, 1, 2].map((index) => (
                  <View key={`collector-loading-${index}`} style={[community.rankRow, community.collectorRankRow, community.collectorLoadingRow]}>
                    <View style={community.collectorLoadingRank} />
                    <View style={community.collectorLoadingAvatar} />
                    <View style={community.collectorLoadingCopy}>
                      <View style={[community.collectorLoadingLine, community.collectorLoadingLineName]} />
                      <View style={[community.collectorLoadingLine, community.collectorLoadingLineDetail]} />
                    </View>
                    <View style={community.collectorLoadingScore} />
                  </View>
                ))}
              </View>
            ) : collectors.map((entry, index) => {
              const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
              return (
                <Pressable
                  key={entry.publicId}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.displayName}, ${metric.label}, rank ${entry.rank}`}
                  accessibilityHint={entry.isMe ? 'This is your collector profile' : 'Open this learner profile to connect'}
                  onPress={() => setSelectedLeaderboardEntry(entry)}
                  style={({ pressed }) => [
                    community.rankRow,
                    index > 0 && community.rankRowAfter,
                    community.collectorRankRow,
                    entry.isMe && community.rankRowMe,
                    entry.rank <= 3 && community.collectorTopRank,
                    entry.rank === 1 && community.rankRowChampion,
                    pressed && community.rankRowPressed,
                  ]}
                >
                  {entry.rank === 1 ? <ChampionRankBackdrop reduceMotion={reduceMotion} /> : null}
                  {entry.rank === 1 ? (
                    <MiniLeaderboardCrest
                      rank={1}
                      level="Novice"
                      championVisual
                      accessibilityLabel="Top Word Collector, First place"
                      testID={`collector-rank-${entry.rank}`}
                    />
                  ) : (
                    <View style={community.collectorRankNumber}>
                      <Text style={entry.rank <= 3 ? community.collectorMedal : community.collectorRankText}>{medal ?? `#${entry.rank}`}</Text>
                    </View>
                  )}
                  <View style={entry.rank === 1 ? community.rankOneAvatarFrame : undefined}>
                    <CommunityAvatar name={entry.displayName} avatarPath={entry.avatarPath} small />
                  </View>
                  <View style={community.rankName}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={community.rankNameText}>{entry.displayName}{entry.isMe ? ' (you)' : ''}</Text>
                    {collectorMetric === 'retention' ? (
                      <RetentionReviewActivity source={entry} />
                    ) : (
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[community.collectorRowDetail, { color: metric.color }]}
                      >
                        {collectorMetric === 'streaks' ? 'Current Learning Streak' : formatJoinedDate(entry.joinedAt)}
                      </Text>
                    )}
                  </View>
                  <View style={community.collectorMetricValue}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={[community.collectorWordCount, { color: metric.color }]}>
                      {collectorMetricValueLabel(collectorMetric, entry)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {noCollectorWords ? (
              <View style={community.empty}>
                <Ionicons name={metric.icon} size={31} color={metric.color} />
                <Text style={community.emptyTitle}>
                  {collectorMetric === 'retention' ? 'Build your retention evidence' : collectorMetric === 'streaks' ? 'Start a Learning Streak' : 'Start discovering words'}
                </Text>
                <Text style={community.emptyText}>
                  {collectorMetric === 'retention'
                    ? 'Review words regularly to qualify for the Retention ranking.'
                    : collectorMetric === 'streaks'
                      ? 'Complete your daily goal today and keep showing up to appear in Learning Streaks.'
                      : 'Add a new word and it will appear in your Word Collector total.'}
                </Text>
              </View>
            ) : null}
            {collectorRankView ? (
              <Pressable onPress={() => {
                setCollectorRankView(false);
                setCollectorPage(0);
                void loadWordCollectors(collectorPeriod, collectorAudience, 0);
              }} style={community.collectorReturnTop}>
                <Text style={community.collectorReturnTopText}>Back to top of ranking</Text>
              </Pressable>
            ) : collectors.length ? (
              collectorHasMore || collectorLoadingMore ? (
                <Pressable disabled={collectorLoadingMore} onPress={() => void loadMoreWordCollectors()} style={({ pressed }) => [community.loadMore, (pressed || collectorLoadingMore) && community.loadMorePressed]}>
                  {collectorLoadingMore ? <ActivityIndicator size="small" color={COLORS.purpleDark} /> : <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.purpleDark} />}
                  <View style={community.loadMoreCopy}>
                    <Text style={community.loadMoreTitle}>{collectorLoadingMore ? 'Loading more learners…' : `Keep exploring ${metric.label}`}</Text>
                    <Text style={community.loadMoreText}>Load the next group without downloading the full ranking.</Text>
                  </View>
                  {!collectorLoadingMore ? <Ionicons name="chevron-down" size={17} color={COLORS.purpleDark} /> : null}
                </Pressable>
              ) : <Text style={community.leaderboardEnd}>You’ve reached everyone in this ranking.</Text>
            ) : null}
          </Animated.View>
        )}
      </>
    );
  };

  const renderLeaderboard = () => (
    <>
      {leaderboardMode === 'collectors' ? renderWordCollectorsHero() : null}
      {leaderboardMode === 'social' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={community.tierLegend}>
        {TIER_LEGEND.map((tierName) => {
          const tier = levelPresentation(tierName);
          return (
          <Pressable
            key={tierName}
            accessibilityRole="button"
            accessibilityLabel={`Show ${tierName} learners`}
            accessibilityHint={selectedLevel === tierName
              ? 'Shows this level now. Tap again to show every level.'
              : 'Shows learners at this level, highest Social XP first.'}
            accessibilityState={{ selected: selectedLevel === tierName }}
            onPress={() => {
              setLeaderboardMode('social');
              selectLeaderboard(period, selectedLevel === tierName ? null : tierName);
            }}
            style={({ pressed }) => [
              community.tierLegendItem,
              selectedLevel === tierName && community.tierLegendItemActive,
              pressed && community.tierLegendItemPressed,
            ]}
          >
            <View style={[
              community.tierLegendDot,
              { backgroundColor: selectedLevel === tierName ? COLORS.white : tier.color },
            ]} />
            <View>
              <Text style={[community.tierLegendText, selectedLevel === tierName && community.tierLegendTextActive]}>{tierName}</Text>
              <Text style={[community.tierLegendCount, selectedLevel === tierName && community.tierLegendCountActive]}>{LEVEL_RULES[tierName]}</Text>
            </View>
          </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show Word Collectors leaderboard"
          accessibilityState={{ selected: false }}
          onPress={() => {
            setLeaderboardMode('collectors');
            setSelectedLevel(null);
            setCollectorRankView(false);
            void loadWordCollectors(collectorPeriod, collectorAudience, 0);
          }}
          style={({ pressed }) => [
            community.tierLegendItem,
            community.collectorDestination,
            pressed && community.tierLegendItemPressed,
          ]}
        >
          <Animated.View
            style={[
              community.collectorDestinationSparkle,
              {
                opacity: collectorSparkleShimmer.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }),
                transform: [{ scale: collectorSparkleShimmer.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
              },
            ]}
          >
            <Svg width={17} height={17} viewBox="0 0 15 15">
              <Path
                d="M7.5 0.5L9.1 5.9L14.5 7.5L9.1 9.1L7.5 14.5L5.9 9.1L0.5 7.5L5.9 5.9Z"
                fill="#BFC5D2"
              />
            </Svg>
          </Animated.View>
          <View>
            <Text style={community.tierLegendText}>Word Collectors</Text>
          <Text style={community.tierLegendCount}>Collectors · Retention · Learning Streaks</Text>
          </View>
        </Pressable>
      </ScrollView> : null}
      {leaderboardMode === 'social' ? (
      <View style={community.socialPeriods}>
        {PERIODS.map((item) => (
          <Pressable
            key={item}
            onPress={() => selectLeaderboard(item)}
            style={[community.socialSegment, period === item && community.socialSegmentActive]}
          >
            <Text style={[community.socialSegmentText, period === item && community.socialSegmentTextActive]}>
              {item === 'all_time' ? 'All time' : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      ) : null}
      {leaderboardMode === 'collectors' ? renderWordCollectors() : <>
      <View style={community.myLeaderboardCard}>
        <Text style={community.myLeaderboardEyebrow}>YOUR LEADERBOARD STATUS</Text>
        <View style={[community.rankRow, community.rankRowMe, leaderboardPlacementStyle(context?.rank, context?.level)]}>
          {context?.rank === 1 ? <ChampionRankBackdrop reduceMotion={reduceMotion} /> : null}
          <MiniLeaderboardCrest
            rank={context?.rank}
            level={context?.level ?? 'Novice'}
            testID="community-your-rank"
          />
          <View style={context?.rank === 1 ? community.rankOneAvatarFrame : undefined}>
            <CommunityAvatar name={context?.profile?.displayName ?? 'You'} avatarPath={context?.profile?.avatarPath} small />
          </View>
            <View style={community.rankName}>
            <Text numberOfLines={1} style={community.rankNameText}>{context?.profile?.displayName} (you)</Text>
            <View style={community.rankDetailRow}>
              {context?.rank === 1 ? (
                <Image source={require('../../assets/splash-icon.png')} style={community.rankWordWizardIcon} />
              ) : (
                <LevelPresentationIcon level={context?.level ?? 'Novice'} size={12} />
              )}
              {context?.rank === 1 ? (
                <WordWizardLabel style={community.rankDetail} />
              ) : (
                <Text style={[community.rankDetail, { color: levelPresentation(context?.level ?? 'Novice').color }]}>{context?.level ?? 'Novice'}</Text>
              )}
              <Text style={community.rankDetailDivider}>·</Text>
              <Text style={community.rankSocialXp}>Social XP</Text>
            </View>
          </View>
          <Text style={community.xp}>{context?.xp.toLocaleString()}</Text>
        </View>
      </View>
      {!context?.profile?.leaderboardOptIn ? (
        <View style={community.notice}>
          <Ionicons name="lock-closed-outline" size={18} color={COLORS.purpleDark} />
          <Text style={community.noticeText}>You are learning privately. Turn on leaderboard visibility in Profile to join the ranking.</Text>
        </View>
      ) : null}
      <Animated.View
        style={{
          opacity: leaderboardEntrance,
          transform: [{ translateY: leaderboardEntrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        }}
      >
        <View style={community.leaderboardStatus}>
          <Text style={community.leaderboardStatusText}>
            {selectedLevel
              ? `${selectedLevel} learners · highest Social XP first`
              : `${PERIOD_LABELS[period]} leaderboard · tap someone to connect`}
          </Text>
          {leaderboardLoading ? <ActivityIndicator size="small" color={COLORS.purple} /> : null}
        </View>
        {leaderboard.map((entry, index) => {
          const tier = levelPresentation(entry.level);
          return (
            <Pressable
              key={entry.publicId}
              accessibilityRole="button"
              accessibilityLabel={`Open ${entry.displayName}'s Connect profile`}
              onPress={() => setSelectedLeaderboardEntry(entry)}
              style={({ pressed }) => [community.rankRow, index > 0 && community.rankRowAfter, entry.isMe && community.rankRowMe, leaderboardPlacementStyle(entry.rank, entry.level), pressed && community.rankRowPressed]}
            >
              {entry.rank === 1 ? <ChampionRankBackdrop reduceMotion={reduceMotion} /> : null}
              <MiniLeaderboardCrest
                rank={entry.rank}
                level={entry.level}
                testID={`community-rank-${entry.rank}`}
              />
              <View style={entry.rank === 1 ? community.rankOneAvatarFrame : undefined}>
                <CommunityAvatar name={entry.displayName} avatarPath={entry.avatarPath} small />
              </View>
              <View style={community.rankName}>
                <Text numberOfLines={1} style={community.rankNameText}>{entry.displayName}{entry.isMe ? ' (you)' : ''}</Text>
                <View style={community.rankDetailRow}>
                  {entry.rank === 1 ? (
                    <Image source={require('../../assets/splash-icon.png')} style={community.rankWordWizardIcon} />
                  ) : (
                    <LevelPresentationIcon level={entry.level} size={12} />
                  )}
                  {entry.rank === 1 ? (
                    <WordWizardLabel style={community.rankDetail} />
                  ) : (
                    <Text style={[community.rankDetail, { color: tier.color }]}>{tier.name}</Text>
                  )}
                  <Text style={community.rankDetailDivider}>·</Text>
                  <Text style={community.rankSocialXp}>Social XP</Text>
                </View>
              </View>
              <Text style={community.xp}>{entry.xp.toLocaleString()}</Text>
            </Pressable>
          );
        })}
        {!leaderboard.length && !leaderboardLoading ? (
          <View style={community.empty}>
            {selectedLevel ? (
              <LevelMagicIcon level={selectedLevel} size={52} variant="bare" color={COLORS.purple} />
            ) : (
              <Ionicons name="sparkles" size={31} color={COLORS.purple} />
            )}
            <Text style={community.emptyTitle}>{selectedLevel ? `No ${selectedLevel} learners yet` : 'The leaderboard is warming up'}</Text>
            <Text style={community.emptyText}>
              {selectedLevel
                ? 'Try another level, or keep learning to become one of the first here.'
                : 'Complete any quiz or flashcard review in WordWiz to earn Social XP and appear here.'}
            </Text>
          </View>
        ) : null}
        {leaderboard.length ? (
          leaderboardHasMore || leaderboardLoadingMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Load more learners"
              accessibilityHint="More learners also load automatically while you scroll."
              disabled={leaderboardLoadingMore}
              onPress={() => void loadMoreLeaderboard()}
              style={({ pressed }) => [community.loadMore, (pressed || leaderboardLoadingMore) && community.loadMorePressed]}
            >
              {leaderboardLoadingMore ? <ActivityIndicator size="small" color={COLORS.purpleDark} /> : <Ionicons name="arrow-down-circle-outline" size={18} color={COLORS.purpleDark} />}
              <View style={community.loadMoreCopy}>
                <Text style={community.loadMoreTitle}>{leaderboardLoadingMore ? 'Loading more learners…' : 'Keep exploring the ranking'}</Text>
                <Text style={community.loadMoreText}>More learners appear as you scroll.</Text>
              </View>
              {!leaderboardLoadingMore ? <Ionicons name="chevron-down" size={17} color={COLORS.purpleDark} /> : null}
            </Pressable>
          ) : (
            <Text style={community.leaderboardEnd}>You’ve reached everyone in this ranking.</Text>
          )
        ) : null}
      </Animated.View>
      </>}
    </>
  );

  const renderFriends = () => (
    <>
      <View style={community.codeCard}>
        <Text style={community.eyebrow}>YOUR FRIEND CODE</Text>
        <Text style={community.code}>{context?.profile?.friendCode}</Text>
        <Text style={community.codeHelp}>Share this code only with people you know.</Text>
      </View>
      <View style={community.addFriend}>
        <TextInput
          value={friendCode}
          onChangeText={(value) => setFriendCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          placeholder="Enter a friend code"
          placeholderTextColor={COLORS.muted}
          autoCapitalize="characters"
          style={community.friendInput}
        />
        <Pressable
          style={[community.smallPrimary, friendCode.length !== 8 && community.disabledButton]}
          disabled={friendCode.length !== 8}
          onPress={addFriend}
        >
          <Text style={community.smallPrimaryText}>Add</Text>
        </Pressable>
      </View>
      {connections.length ? (
        <View style={community.friendListHeader}>
          <Text style={community.friendListTitle}>{connections.length} friends</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort friends: ${FRIEND_SORT_LABELS[friendSort]}`}
            accessibilityHint="Choose how your friends are arranged"
            onPress={openFriendSortMenu}
            style={({ pressed }) => [community.friendSortButton, pressed && community.friendSortButtonPressed]}
          >
            <Ionicons name="funnel-outline" size={15} color={COLORS.purpleDark} />
            <Text style={community.friendSortText}>{FRIEND_SORT_LABELS[friendSort]}</Text>
            <Ionicons name="chevron-down" size={14} color={COLORS.purpleDark} />
          </Pressable>
        </View>
      ) : null}
      {visibleConnections.map((friend) => (
        <View key={friend.requestId} style={community.friendRow}>
          <CommunityAvatar name={friend.displayName} avatarPath={friend.avatarPath} />
          <View style={community.friendInfo}>
            <Text style={community.friendName}>{friend.displayName}</Text>
            <Text style={community.friendDetail}>
              {friend.status === 'pending'
                ? friend.direction === 'incoming' ? 'Wants to connect' : 'Request sent'
                : friend.isMuted ? 'Nudges muted' : 'Connected'}
            </Text>
            <Text style={community.friendAdded}>
              {friend.status === 'accepted'
                ? 'Added'
                : friend.direction === 'outgoing' ? 'Sent' : 'Received'} {formatFriendConnectionTime(friend.addedAt)}
            </Text>
          </View>
          {friend.status === 'pending' && friend.direction === 'incoming' ? (
            <View style={community.friendActions}>
              <Pressable onPress={() => void runConnectionAction(
                () => respondToCommunityFriendRequest(friend.requestId, true),
                'Could not accept request',
              )}>
                <Text style={community.accept}>Accept</Text>
              </Pressable>
              <Pressable onPress={() => void runConnectionAction(
                () => respondToCommunityFriendRequest(friend.requestId, false),
                'Could not decline request',
              )}>
                <Text style={community.subtleAction}>Decline</Text>
              </Pressable>
            </View>
          ) : friend.status === 'accepted' ? (
            <View style={community.friendActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Send a nudge to ${friend.displayName}`}
                accessibilityHint="Choose a friendly message to send"
                onPress={() => openFriendNudgePicker(friend)}
              >
                <Ionicons name="paper-plane-outline" size={21} color={COLORS.purpleDark} />
              </Pressable>
              <Pressable onPress={() => void runConnectionAction(
                () => setCommunityMute(friend.publicId, !friend.isMuted),
                'Could not update mute setting',
              )}>
                <Ionicons name={friend.isMuted ? 'notifications-outline' : 'notifications-off-outline'} size={21} color={COLORS.muted} />
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('Manage friend', `Remove or block ${friend.displayName}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', onPress: () => void runConnectionAction(
                    () => removeOrBlockCommunityConnection(friend.publicId, false),
                    'Could not remove friend',
                  ) },
                  { text: 'Block', style: 'destructive', onPress: () => void runConnectionAction(
                    () => removeOrBlockCommunityConnection(friend.publicId, true),
                    'Could not block friend',
                  ) },
                ])}
              >
                <Ionicons name="ellipsis-horizontal" size={21} color={COLORS.muted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {!connections.length ? (
        <View style={community.empty}>
          <Ionicons name="people-outline" size={30} color={COLORS.purple} />
          <Text style={community.emptyTitle}>Invite your learning circle</Text>
          <Text style={community.emptyText}>Add friends with their code to share gentle encouragement—nothing is public by default.</Text>
        </View>
      ) : null}
      {renderSocialPagination(activeFriendPage, friendPageCount, setFriendPage)}
    </>
  );

  const renderNudges = () => {
    const groupedNudges = [...NUDGE_GROUPS, GOLDEN_NUDGE_GROUP].map((group) => ({
      ...group,
      nudges: visibleNudges.filter((nudge) => nudgeOptionFor(nudge).group === group.group),
    })).filter((group) => group.nudges.length > 0);

    return (
      <>
        <View style={community.nudgeComposer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send a nudge"
            accessibilityHint={nudgeComposerExpanded ? 'Hide the nudge message library' : 'Show friends and message categories'}
            accessibilityState={{ expanded: nudgeComposerExpanded }}
            onPress={() => setNudgeComposerExpanded((current) => {
              if (current) setGoldenNudgeComposerOpen(false);
              return !current;
            })}
            style={({ pressed }) => [community.nudgeComposerHeading, pressed && community.nudgeComposerHeaderPressed]}
          >
            <View style={community.nudgeComposerIcon}>
              <Ionicons name="paper-plane-outline" size={20} color={COLORS.purpleDark} />
            </View>
            <View style={community.nudgeComposerHeadingCopy}>
              <Text style={community.nudgeComposerTitle}>Send a nudge</Text>
              <Text style={community.nudgeComposerHelp}>Pick a friend, then choose a message that fits.</Text>
            </View>
            <Ionicons name={nudgeComposerExpanded ? 'chevron-up' : 'chevron-down'} size={19} color={COLORS.muted} />
          </Pressable>
          {nudgeComposerExpanded ? (
            <>
              {nudgeRecipients.length ? (
                <>
                  <Text style={community.nudgeComposerLabel}>TO</Text>
                  <View style={community.nudgeRecipientSearch}>
                    <Ionicons name="search-outline" size={17} color={COLORS.muted} />
                    <TextInput
                      accessibilityLabel="Search connected friends"
                      value={nudgeRecipientSearch}
                      onChangeText={(value) => setNudgeRecipientSearch(value.slice(0, 32))}
                      placeholder="Search friends"
                      placeholderTextColor={COLORS.muted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      style={community.nudgeRecipientSearchInput}
                    />
                    {nudgeRecipientSearch ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear friend search"
                        hitSlop={8}
                        onPress={() => setNudgeRecipientSearch('')}
                      >
                        <Ionicons name="close-circle" size={17} color={COLORS.muted} />
                      </Pressable>
                    ) : null}
                  </View>
                  {visibleNudgeRecipients.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={community.nudgeRecipientList}>
                      {visibleNudgeRecipients.map((friend) => {
                        const selected = friend.publicId === selectedNudgeRecipient?.publicId;
                        return (
                          <Pressable
                            key={friend.publicId}
                            accessibilityRole="button"
                            accessibilityLabel={`Nudge ${friend.displayName}`}
                            accessibilityState={{ selected }}
                            onPress={() => setSelectedNudgeRecipientId(friend.publicId)}
                            style={[community.nudgeRecipient, selected && community.nudgeRecipientSelected]}
                          >
                            <CommunityAvatar name={friend.displayName} avatarPath={friend.avatarPath} small />
                            <Text numberOfLines={1} style={[community.nudgeRecipientText, selected && community.nudgeRecipientTextSelected]}>{friend.displayName}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={community.nudgeNoRecipient}>
                      <Ionicons name="search-outline" size={17} color={COLORS.muted} />
                      <Text style={community.nudgeNoRecipientText}>No connected friends match that search.</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={community.nudgeNoRecipient}>
                  <Ionicons name="people-outline" size={17} color={COLORS.muted} />
                  <Text style={community.nudgeNoRecipientText}>Connect with a friend in Friends to send nudges.</Text>
                </View>
              )}
              <Text style={community.nudgeComposerLabel}>CHOOSE A MESSAGE</Text>
              {NUDGE_GROUPS.map((group) => {
                const expanded = expandedNudgeCategory === group.group;
                return (
                  <View key={group.group} style={community.nudgeComposerGroup}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedNudgeCategory((current) => current === group.group ? null : group.group)}
                      style={[community.nudgeCategoryTrigger, expanded && community.nudgeCategoryTriggerExpanded]}
                    >
                      <View style={[community.nudgePickerGroupIcon, { backgroundColor: group.background }]}>
                        <Ionicons name={group.icon} size={15} color={group.color} />
                      </View>
                      <View style={community.nudgeCategoryCopy}>
                        <Text style={community.nudgePickerGroupText}>{group.group}</Text>
                        <Text style={community.nudgeCategoryCount}>{group.options.length} messages</Text>
                      </View>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.muted} />
                    </Pressable>
                    {expanded ? group.options.map((option) => (
                      <Pressable
                        key={option.key}
                        onPress={() => void sendNudgeFromInbox(option)}
                        style={({ pressed }) => [community.nudgeOption, pressed && community.nudgeOptionPressed, !selectedNudgeRecipient && community.nudgeOptionUnavailable]}
                      >
                        <View style={[community.nudgeOptionIcon, { backgroundColor: option.background }]}>
                          <Ionicons name={option.icon} size={18} color={option.color} />
                        </View>
                        <Text style={community.nudgeOptionTitle}>{option.title}</Text>
                        <Ionicons name={selectedNudgeRecipient ? 'paper-plane-outline' : 'lock-closed-outline'} size={16} color={selectedNudgeRecipient ? COLORS.purpleDark : COLORS.muted} />
                      </Pressable>
                    )) : null}
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a Golden Nudge"
                accessibilityHint="Use one Golden Ticket to write a custom message for a friend"
                accessibilityState={{ expanded: goldenNudgeComposerOpen }}
                onPress={openGoldenNudgeComposer}
                style={({ pressed }) => [
                  community.goldenNudgeCard,
                  goldenNudgeComposerOpen && community.goldenNudgeCardOpen,
                  pressed && community.goldenNudgeCardPressed,
                  (refreshTokens < 1 || !selectedNudgeRecipient) && community.goldenNudgeUnavailable,
                ]}
              >
                <LinearGradient
                  colors={WORDWIZ_GRADIENT_COLORS}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  pointerEvents="none"
                  style={community.goldenNudgeCardGradient}
                />
                <View style={community.goldenNudgeIcon}>
                  <Ionicons name="ticket-outline" size={19} color="#B98416" />
                </View>
                <View style={community.goldenNudgeCopy}>
                  <View style={community.goldenNudgeTitleRow}>
                    <Text style={community.goldenNudgeTitle}>Golden Nudge</Text>
                    <Text style={community.goldenNudgeCount}>{refreshTokens} {refreshTokens === 1 ? 'ticket' : 'tickets'}</Text>
                  </View>
                  <Text style={community.goldenNudgeHelp}>Write a one-of-a-kind message for a friend.</Text>
                </View>
                <Ionicons name={goldenNudgeComposerOpen ? 'chevron-up' : 'chevron-down'} size={17} color="#B98416" />
              </Pressable>
              {goldenNudgeComposerOpen ? (
                <View style={community.goldenNudgeEditor}>
                  <View style={community.goldenNudgeEditorHeader}>
                    <View style={community.goldenNudgeEditorTitleRow}>
                      <Ionicons name="sparkles-outline" size={17} color="#B98416" />
                      <Text style={community.goldenNudgeEditorTitle}>Write your golden nudge</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close Golden Nudge editor"
                      onPress={() => setGoldenNudgeComposerOpen(false)}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle-outline" size={21} color={COLORS.muted} />
                    </Pressable>
                  </View>
                  <TextInput
                    accessibilityLabel="Golden Nudge message"
                    value={goldenNudgeMessage}
                    onChangeText={setGoldenNudgeMessage}
                    placeholder="Write something kind, funny, or encouraging…"
                    placeholderTextColor={COLORS.muted}
                    maxLength={GOLDEN_NUDGE_MAX_LENGTH}
                    multiline
                    textAlignVertical="top"
                    style={community.goldenNudgeInput}
                  />
                  <View style={community.goldenNudgeEditorFooter}>
                    <Text style={community.goldenNudgeCharacterCount}>{goldenNudgeMessage.length}/{GOLDEN_NUDGE_MAX_LENGTH}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Use one Golden Ticket and send nudge"
                      disabled={goldenNudgeSending || !goldenNudgeMessage.trim() || !selectedNudgeRecipient || refreshTokens < 1}
                      onPress={() => void sendGoldenNudge()}
                      style={({ pressed }) => [
                        community.goldenNudgeSend,
                        pressed && community.goldenNudgeSendPressed,
                        (goldenNudgeSending || !goldenNudgeMessage.trim() || !selectedNudgeRecipient || refreshTokens < 1) && community.goldenNudgeSendDisabled,
                      ]}
                    >
                      <Ionicons name="ticket-outline" size={15} color={COLORS.white} />
                      <Text style={community.goldenNudgeSendText}>{goldenNudgeSending ? 'Sending…' : 'Use 1 ticket · Send'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        {groupedNudges.map((group) => (
          <View key={group.group} style={community.nudgeInboxGroup}>
            <View style={community.nudgeInboxGroupTitle}>
              <View style={[community.nudgeInboxGroupIcon, { backgroundColor: group.background }]}>
                <Ionicons name={group.icon} size={15} color={group.color} />
              </View>
              <Text style={community.nudgeInboxGroupText}>{group.group}</Text>
            </View>
            {group.nudges.map((nudge) => {
              const option = nudgeOptionFor(nudge);
              return (
                <Pressable
                  key={nudge.id}
                  onPress={() => void markCommunityNudgeRead(nudge.id).then(refreshCommunity)}
                  style={[community.nudge, !nudge.readAt && community.nudgeUnread]}
                >
                  <CommunityAvatar name={nudge.senderName} avatarPath={nudge.senderAvatarPath} small />
                  <View style={community.nudgeText}>
                    <View style={community.nudgeTitleRow}>
                      <Text numberOfLines={1} ellipsizeMode="tail" style={community.nudgeTitle}>{nudge.senderName} sent you a nudge</Text>
                      <Text style={community.nudgeTimestamp}>{formatNudgeTimestamp(nudge.createdAt)}</Text>
                    </View>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={community.nudgeDetail}>{option.title}</Text>
                  </View>
                  {!nudge.readAt ? <View style={community.unreadDot} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {!nudges.length ? (
          <View style={community.nudgeInboxEmpty}>
            <Ionicons name="mail-open-outline" size={22} color={COLORS.purple} />
            <View style={community.nudgeInboxEmptyCopy}>
              <Text style={community.nudgeInboxEmptyTitle}>Your inbox is quiet</Text>
              <Text style={community.nudgeInboxEmptyText}>Nudges from friends will appear below the message library.</Text>
            </View>
          </View>
        ) : null}
        {renderSocialPagination(activeNudgePage, nudgePageCount, setNudgePage)}
        {nudgeHasMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load older nudges"
            accessibilityHint="Fetches the next group of older nudges without loading the whole inbox at once"
            disabled={nudgeLoadingMore}
            onPress={() => void loadMoreNudges()}
            style={({ pressed }) => [community.loadMore, (pressed || nudgeLoadingMore) && community.loadMorePressed]}
          >
            {nudgeLoadingMore ? <ActivityIndicator size="small" color={COLORS.purpleDark} /> : <Ionicons name="archive-outline" size={18} color={COLORS.purpleDark} />}
            <View style={community.loadMoreCopy}>
              <Text style={community.loadMoreTitle}>{nudgeLoadingMore ? 'Loading older nudges…' : 'Show older nudges'}</Text>
              <Text style={community.loadMoreText}>Recent nudges stay easy to scan; older ones load when you ask.</Text>
            </View>
            {!nudgeLoadingMore ? <Ionicons name="chevron-down" size={17} color={COLORS.purpleDark} /> : null}
          </Pressable>
        ) : nudges.length >= NUDGE_FETCH_SIZE ? (
          <Text style={community.nudgeHistoryEnd}>You’re all caught up with your nudge history.</Text>
        ) : null}
      </>
    );
  };

  if (initialLoading) {
    return (
      <View style={community.loading}>
        <ActivityIndicator color={COLORS.purple} />
        <Text style={community.loadingText}>Opening Connect…</Text>
      </View>
    );
  }

  if (context && !context.enabled) {
    return (
      <ScrollView contentContainerStyle={community.container}>
        <View style={community.hero}>
          <Ionicons name="people" size={28} color={COLORS.purpleDark} />
          <Text style={community.heroTitle}>Connect is taking a short break</Text>
          <Text style={community.heroText}>Community features are temporarily unavailable. Your learning words, progress, and account are unaffected.</Text>
        </View>
      </ScrollView>
    );
  }

  if (!context?.profile) {
    return (
      <>
        <ScrollView contentContainerStyle={community.container}>
          <View style={community.hero}>
            <Ionicons name="people" size={28} color={COLORS.purpleDark} />
            <Text style={community.heroTitle}>{isEditingProfile ? 'Connect profile settings' : 'Connect with learners'}</Text>
            <Text style={community.heroText}>
              {isEditingProfile
                ? 'Choose what other learners can see. Turn off “Show my Connect profile” to hide from public browsing and rankings; private friendships stay available.'
                : 'Create a public display name to join optional rankings and connect with friends. Your words, definitions, and learning data stay private.'}
            </Text>
          </View>
          <Text style={community.fieldLabel}>Display name</Text>
          <TextInput value={profileName} onChangeText={setProfileName} placeholder="3–24 characters" placeholderTextColor={COLORS.muted} style={community.input} maxLength={24} />
          <Preference
            label="Show my Connect profile"
            detail={profileVisible
              ? 'Visible to people browsing Connect. Turn this off to hide from public browsing and rankings.'
              : 'Hidden from public browsing and rankings. Private friendships stay available, and you can turn this back on any time.'}
            value={profileVisible}
            onChange={setProfileVisible}
            status={profileVisible ? 'PUBLIC' : 'PRIVATE'}
          />
          <Preference label="Appear on leaderboards" detail="Optional. You can still use friends privately." value={leaderboardOptIn} onChange={setLeaderboardOptIn} />
          <Preference label="Allow friend requests" detail="People need your code to find you." value={requestsEnabled} onChange={setRequestsEnabled} />
          <Preference label="Allow study nudges" detail="Friends can send a gentle reminder." value={nudgesEnabled} onChange={setNudgesEnabled} />
          <Preference label="Push nudges" detail="We will ask for notification permission only after setup." value={pushEnabled} onChange={setPushEnabled} />
          <Pressable disabled={saving || profileName.trim().length < 3} style={[community.primaryButton, (saving || profileName.trim().length < 3) && community.disabledButton]} onPress={() => void saveProfile()}>
            <Text style={community.primaryButtonText}>
              {saving ? (isEditingProfile ? 'Saving settings…' : 'Creating profile…') : isEditingProfile ? 'Save Connect settings' : 'Create Connect profile'}
            </Text>
          </Pressable>
        </ScrollView>
        <Modal
          visible={profileSetupPromptVisible}
          transparent
          animationType={reduceMotion ? 'none' : 'fade'}
          onRequestClose={() => setProfileSetupPromptVisible(false)}
        >
          <View style={community.profileSetupPromptBackdrop}>
            <View style={community.profileSetupPromptCard}>
              <View style={community.profileSetupPromptIcon}>
                <LinearGradient colors={WORDWIZ_GRADIENT_COLORS} style={StyleSheet.absoluteFill} />
                <Ionicons name="people-outline" size={30} color={COLORS.purpleDark} />
              </View>
              <Text style={community.profileSetupPromptEyebrow}>ONE QUICK STEP</Text>
              <Text style={community.profileSetupPromptTitle}>Finish your Connect profile</Text>
              <Text style={community.profileSetupPromptText}>
                Add a display name first, then you can add your profile picture right away.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create Connect profile"
                onPress={() => setProfileSetupPromptVisible(false)}
                style={({ pressed }) => [community.profileSetupPromptPrimary, pressed && community.profileSetupPromptPressed]}
              >
                <LinearGradient colors={WORDWIZ_GRADIENT_COLORS} style={community.profileSetupPromptPrimaryGradient}>
                  <Ionicons name="arrow-forward-circle-outline" size={20} color={COLORS.purpleDark} />
                  <Text style={community.profileSetupPromptPrimaryText}>Create profile</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss profile setup prompt"
                onPress={() => setProfileSetupPromptVisible(false)}
                style={({ pressed }) => [community.profileSetupPromptSecondary, pressed && community.profileSetupPromptPressed]}
              >
                <Text style={community.profileSetupPromptSecondaryText}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={community.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          if (section !== 'leaderboard') return;
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (contentOffset.y + layoutMeasurement.height < contentSize.height - 220) return;
          if (leaderboardMode === 'collectors') {
            if (collectorHasMore && !collectorLoading && !collectorLoadingMore) void loadMoreWordCollectors();
          } else if (leaderboardHasMore && !leaderboardLoading && !leaderboardLoadingMore) {
            void loadMoreLeaderboard();
          }
        }}
      >
      <Animated.View
        style={[
          community.profileHeader,
          {
            opacity: profileEntrance,
            transform: [
              { translateY: profileEntrance.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
              { scale: profileEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
            ],
          },
        ]}
      >
        <Pressable onPress={openProfileEditor} accessibilityRole="button" accessibilityLabel="Edit Connect profile" accessibilityHint="Opens settings for your public Connect profile" hitSlop={8} style={community.profileSettings}>
          <Ionicons name="settings-outline" size={23} color={COLORS.purpleDark} />
        </Pressable>
        <View style={community.profileHeaderTop}>
          <Pressable
            disabled={avatarUpdating}
            onPress={() => void updateAvatar()}
            accessibilityLabel="Add or update profile picture"
            accessibilityState={{ busy: avatarUpdating, disabled: avatarUpdating }}
            style={community.avatarPress}
          >
            <CommunityAvatar name={context.profile.displayName} avatarPath={context.profile.avatarPath} large />
            <View style={community.avatarEdit}>
              <Ionicons name={avatarUpdating ? 'hourglass-outline' : 'camera'} size={13} color={COLORS.white} />
            </View>
          </Pressable>
          <View style={community.profileCopy}>
            <Text style={community.profileEyebrow}>YOUR LEARNING PROFILE</Text>
            <Text style={community.profileName}>{context.profile.displayName}</Text>
            <Text style={community.photoAction}>{avatarUpdating ? 'Checking picture…' : context.profile.avatarPath ? 'Tap your photo to change it' : 'Tap your photo to add one'}</Text>
          </View>
        </View>
        <View style={community.profileStats}>
          <View style={community.profileStat}>
            <Text style={community.profileStatValue}>{context.xp.toLocaleString()}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How Social XP works"
              accessibilityHint="Opens details about how Social XP is earned"
              hitSlop={7}
              onPress={() => setSocialXpSheetOpen(true)}
              style={community.profileStatLabelRow}
            >
              <Text style={community.profileStatLabel}>SOCIAL XP · {PERIOD_LABELS[period].toUpperCase()}</Text>
              <View style={community.profileXpInfoButton}>
                <Ionicons name="information-circle-outline" size={12} color={COLORS.muted} />
              </View>
            </Pressable>
          </View>
          <View style={community.profileRank}>
            <Ionicons name="trophy-outline" size={17} color={COLORS.orange} />
            <Text style={community.profileRankText}>{context.rank ? `#${context.rank} ranking` : 'Private profile'}</Text>
          </View>
        </View>
      </Animated.View>
      {!context.profile.profileVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Make my Connect profile visible again"
          accessibilityHint="Opens Connect profile settings"
          onPress={openProfileEditor}
          style={({ pressed }) => [community.privateProfileNotice, pressed && community.privateProfileNoticePressed]}
        >
          <View style={community.privateProfileNoticeIcon}>
            <Ionicons name="eye-off-outline" size={18} color={COLORS.purpleDark} />
          </View>
          <View style={community.privateProfileNoticeCopy}>
            <Text style={community.privateProfileNoticeTitle}>Your profile is private</Text>
            <Text style={community.privateProfileNoticeText}>You’re hidden from public Connect browsing. Tap here to make your profile visible again.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.purpleDark} />
        </Pressable>
      ) : null}
      <View style={community.nav}>
        {(['leaderboard', 'friends', 'nudges'] as CommunitySection[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item }}
            onPress={() => {
              if (item === 'leaderboard') {
                returnToMainLeaderboard();
                return;
              }
              setSection(item);
            }}
            style={({ pressed }) => [community.navItem, section === item && community.navItemActive, pressed && community.navItemPressed]}
          >
            <View style={[community.navIcon, section === item && community.navIconActive]}>
              <Ionicons
                name={item === 'leaderboard' ? 'trophy-outline' : item === 'friends' ? 'people-outline' : 'sparkles-outline'}
                size={item === 'leaderboard' ? 17 : 16}
                color={section === item ? COLORS.purpleDark : COLORS.muted}
              />
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[community.navText, section === item && community.navTextActive]}
            >
              {item === 'nudges' && context.unreadNudges ? `Nudges (${context.unreadNudges})` : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === 'leaderboard' && leaderboardMode === 'social' ? (
        <ScoreExplainer
          expanded={socialXpExplainerOpen}
          onToggle={() => setSocialXpExplainerOpen((open) => !open)}
        />
      ) : null}
      {section === 'leaderboard' ? renderLeaderboard() : section === 'friends' ? renderFriends() : renderNudges()}
      </ScrollView>
      <SocialXpExplainerSheet
        visible={socialXpSheetOpen}
        onClose={() => setSocialXpSheetOpen(false)}
      />
      <Modal
        visible={Boolean(selectedFriendForNudge)}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={closeFriendNudgePicker}
      >
        <Pressable
          accessible={false}
          onPress={closeFriendNudgePicker}
          style={community.friendNudgeBackdrop}
        >
          <Pressable
            accessible={false}
            onPress={(event) => event.stopPropagation()}
            style={community.friendNudgeSheet}
          >
            <View pointerEvents="none" accessible={false} style={community.friendNudgeHandle} />
            <View style={community.friendNudgeHeader}>
              <View style={community.friendNudgeHeading}>
                <CommunityAvatar
                  name={selectedFriendForNudge?.displayName ?? ''}
                  avatarPath={selectedFriendForNudge?.avatarPath ?? null}
                  small
                />
                <View style={community.friendNudgeHeadingCopy}>
                  <Text style={community.friendNudgeTitle}>Send a nudge</Text>
                  <Text numberOfLines={2} style={community.friendNudgeHelp}>
                    Choose a friendly message for {selectedFriendForNudge?.displayName ?? 'your friend'}.
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close nudge picker"
                accessibilityHint="Closes the nudge menu"
                disabled={Boolean(friendNudgeSendingKey) || friendGoldenNudgeSending}
                onPress={closeFriendNudgePicker}
                hitSlop={8}
                style={community.friendNudgeClose}
              >
                <Ionicons name="close" size={19} color={COLORS.muted} />
              </Pressable>
            </View>
            <ScrollView
              style={community.friendNudgeScroll}
              contentContainerStyle={community.nudgePickerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {NUDGE_GROUPS.map((group) => {
                const expanded = friendNudgeGroup === group.group;
                return (
                  <View key={group.group} style={community.nudgePickerGroup}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => {
                        setFriendGoldenNudgeOpen(false);
                        setFriendNudgeGroup((current) => current === group.group ? null : group.group);
                      }}
                      style={[community.nudgeCategoryTrigger, expanded && community.nudgeCategoryTriggerExpanded]}
                    >
                      <View style={[community.nudgePickerGroupIcon, { backgroundColor: group.background }]}>
                        <Ionicons name={group.icon} size={15} color={group.color} />
                      </View>
                      <View style={community.nudgeCategoryCopy}>
                        <Text style={community.nudgePickerGroupText}>{group.group}</Text>
                        <Text style={community.nudgeCategoryCount}>{group.options.length} messages</Text>
                      </View>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.muted} />
                    </Pressable>
                    {expanded ? group.options.map((option) => (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        accessibilityLabel={`Send ${option.title}`}
                        disabled={Boolean(friendNudgeSendingKey) || friendGoldenNudgeSending}
                        onPress={() => void sendFriendNudge(option)}
                        style={({ pressed }) => [
                          community.nudgeOption,
                          pressed && community.nudgeOptionPressed,
                          (friendNudgeSendingKey || friendGoldenNudgeSending) && community.disabledButton,
                        ]}
                      >
                        <View style={[community.nudgeOptionIcon, { backgroundColor: option.background }]}>
                          <Ionicons name={option.icon} size={18} color={option.color} />
                        </View>
                        <Text style={community.nudgeOptionTitle}>{option.title}</Text>
                        {friendNudgeSendingKey === option.key
                          ? <ActivityIndicator size="small" color={COLORS.purpleDark} />
                          : <Ionicons name="paper-plane-outline" size={17} color={COLORS.purpleDark} />}
                      </Pressable>
                    )) : null}
                  </View>
                );
              })}
              <View style={community.nudgePickerGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create a Golden Nudge"
                  accessibilityHint="Use one Golden Ticket to write a custom message for this friend"
                  accessibilityState={{ expanded: friendGoldenNudgeOpen }}
                  onPress={() => {
                    if (friendGoldenNudgeOpen) {
                      setFriendGoldenNudgeOpen(false);
                      return;
                    }
                    if (refreshTokens < 1) {
                      Alert.alert('No Golden Tickets yet', 'Unlock achievements to earn a Golden Ticket for a one-of-a-kind nudge.');
                      return;
                    }
                    setFriendNudgeGroup(null);
                    setFriendGoldenNudgeOpen(true);
                  }}
                  disabled={Boolean(friendNudgeSendingKey) || friendGoldenNudgeSending}
                  style={({ pressed }) => [
                    community.goldenNudgeCard,
                    community.friendGoldenNudgeCard,
                    friendGoldenNudgeOpen && community.goldenNudgeCardOpen,
                    pressed && community.goldenNudgeCardPressed,
                    refreshTokens < 1 && community.goldenNudgeUnavailable,
                    (friendNudgeSendingKey || friendGoldenNudgeSending) && community.disabledButton,
                  ]}
                >
                  <LinearGradient
                    colors={WORDWIZ_GRADIENT_COLORS}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    pointerEvents="none"
                    style={community.goldenNudgeCardGradient}
                  />
                  <View style={community.goldenNudgeIcon}>
                    <Ionicons name="ticket-outline" size={19} color="#B98416" />
                  </View>
                  <View style={community.goldenNudgeCopy}>
                    <View style={community.goldenNudgeTitleRow}>
                      <Text style={community.goldenNudgeTitle}>Golden Nudge</Text>
                      <Text style={community.goldenNudgeCount}>{refreshTokens} {refreshTokens === 1 ? 'ticket' : 'tickets'}</Text>
                    </View>
                    <Text style={community.goldenNudgeHelp}>
                      {refreshTokens > 0 ? 'Write a one-of-a-kind message · uses 1 ticket' : 'Earn a Golden Ticket to unlock custom nudges.'}
                    </Text>
                  </View>
                  <Ionicons name={friendGoldenNudgeOpen ? 'chevron-up' : 'chevron-down'} size={17} color="#B98416" />
                </Pressable>
                {friendGoldenNudgeOpen ? (
                  <View style={community.goldenNudgeEditor}>
                    <View style={community.goldenNudgeEditorHeader}>
                      <View style={community.goldenNudgeEditorTitleRow}>
                        <Ionicons name="sparkles-outline" size={17} color="#B98416" />
                        <Text style={community.goldenNudgeEditorTitle}>Write your golden nudge</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Close Golden Nudge editor"
                        onPress={() => setFriendGoldenNudgeOpen(false)}
                        hitSlop={8}
                      >
                        <Ionicons name="close-circle-outline" size={21} color={COLORS.muted} />
                      </Pressable>
                    </View>
                    <TextInput
                      accessibilityLabel="Golden Nudge message"
                      value={friendGoldenNudgeMessage}
                      onChangeText={setFriendGoldenNudgeMessage}
                      placeholder="Write something kind, funny, or encouraging…"
                      placeholderTextColor={COLORS.muted}
                      maxLength={GOLDEN_NUDGE_MAX_LENGTH}
                      multiline
                      textAlignVertical="top"
                      style={community.goldenNudgeInput}
                    />
                    <View style={community.goldenNudgeEditorFooter}>
                      <Text style={community.goldenNudgeCharacterCount}>{friendGoldenNudgeMessage.length}/{GOLDEN_NUDGE_MAX_LENGTH}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Use one Golden Ticket and send nudge"
                        disabled={friendGoldenNudgeSending || !friendGoldenNudgeMessage.trim() || refreshTokens < 1}
                        onPress={() => void sendFriendGoldenNudge()}
                        style={({ pressed }) => [
                          community.goldenNudgeSend,
                          pressed && community.goldenNudgeSendPressed,
                          (friendGoldenNudgeSending || !friendGoldenNudgeMessage.trim() || refreshTokens < 1) && community.goldenNudgeSendDisabled,
                        ]}
                      >
                        <Ionicons name="ticket-outline" size={15} color={COLORS.white} />
                        <Text style={community.goldenNudgeSendText}>{friendGoldenNudgeSending ? 'Sending…' : 'Use 1 ticket · Send'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={Boolean(selectedLeaderboardEntry)}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setSelectedLeaderboardEntry(null)}
      >
        <View style={community.memberSheetBackdrop}>
          <ScrollView style={community.memberSheetScroll} contentContainerStyle={community.memberSheet} showsVerticalScrollIndicator={false} bounces={false}>
            <View pointerEvents="none" accessible={false} style={community.memberSheetHandle} />
            <Pressable onPress={() => setSelectedLeaderboardEntry(null)} accessibilityLabel="Close profile" style={community.memberSheetClose}>
              <Ionicons name="close" size={20} color={COLORS.muted} />
            </Pressable>
            {selectedLeaderboardEntry ? (
              <>
                <View style={community.memberSheetIdentity}>
                  <View
                    style={[
                      community.memberSheetAvatarRing,
                      { borderColor: selectedTier?.color ?? selectedCollectorMetric?.color ?? COLORS.blue },
                      isCommunityLeaderboardEntry(selectedLeaderboardEntry) && selectedLeaderboardEntry.level === 'Grandmaster' && community.memberSheetAvatarRingGrandmaster,
                    ]}
                  >
                    <CommunityAvatar name={selectedLeaderboardEntry.displayName} avatarPath={selectedLeaderboardEntry.avatarPath} large />
                  </View>
                  <Text style={community.memberSheetName}>{selectedLeaderboardEntry.displayName}{selectedLeaderboardEntry.isMe ? ' (you)' : ''}</Text>
                  {selectedTier && isCommunityLeaderboardEntry(selectedLeaderboardEntry) ? (
                    <TierBadge level={selectedLeaderboardEntry.level} rank={selectedLeaderboardEntry.rank} modal />
                  ) : selectedCollectorMetric ? (
                    <View style={[community.memberSheetCollectorBadge, { borderColor: `${selectedCollectorMetric.color}55`, backgroundColor: `${selectedCollectorMetric.color}16` }]}>
                      <Ionicons name={selectedCollectorMetric.icon} size={13} color={selectedCollectorMetric.color} />
                      <Text style={[community.memberSheetCollectorBadgeText, { color: selectedCollectorMetric.color }]}>{selectedCollectorMetric.label}</Text>
                    </View>
                  ) : null}
                  <Text style={community.memberSheetScore}>
                    <Text style={community.memberSheetRank}>#{selectedLeaderboardEntry.rank}</Text>
                    <Text style={community.memberSheetScoreSeparator}> · </Text>
                    {isCommunityLeaderboardEntry(selectedLeaderboardEntry) ? (
                      <Text>{selectedLeaderboardEntry.xp.toLocaleString()} Social XP</Text>
                    ) : (
                      <Text>{collectorMetricValueLabel(collectorMetric, selectedLeaderboardEntry)}</Text>
                    )}
                  </Text>
                </View>
                {isCommunityLeaderboardEntry(selectedLeaderboardEntry) ? (
                  <View style={community.memberSheetStats}>
                    <Text style={community.memberSheetStatsTitle}>LEARNING SNAPSHOT</Text>
                    <View style={community.memberSheetStatsGrid}>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedLeaderboardEntry.wordCount)}</Text>
                        <Text style={community.memberSheetStatLabel}>WORDS</Text>
                      </View>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedLeaderboardEntry.achievementsUnlocked)}</Text>
                        <Text style={community.memberSheetStatLabel}>UNLOCKED</Text>
                      </View>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedLeaderboardEntry.quizCount)}</Text>
                        <Text style={community.memberSheetStatLabel}>QUIZZES</Text>
                      </View>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedLeaderboardEntry.flashcardReviewCount)}</Text>
                        <Text style={community.memberSheetStatLabel}>CARD REVIEWS</Text>
                      </View>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedLeaderboardEntry.activeStudyDays30d)}</Text>
                        <Text style={community.memberSheetStatLabel}>ACTIVE DAYS</Text>
                        <Text style={community.memberSheetStatCaption}>Last 30 days</Text>
                      </View>
                    </View>
                  </View>
                ) : selectedCollectorEntry ? (
                  <View style={community.memberSheetStats}>
                    <Text style={community.memberSheetStatsTitle}>COLLECTOR SNAPSHOT</Text>
                    <View style={community.memberSheetStatsGrid}>
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.wordCount)}</Text>
                        <Text style={community.memberSheetStatLabel}>WORDS ADDED</Text>
                      </View>
                      {collectorMetric === 'retention' ? (
                        <>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.retentionPercent ?? selectedCollectorEntry.metricValue)}</Text>
                            <Text style={community.memberSheetStatLabel}>RETENTION</Text>
                          </View>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.reviewCount)}</Text>
                            <Text style={community.memberSheetStatLabel}>TOTAL REVIEWS</Text>
                          </View>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.flashcardReviewCount)}</Text>
                            <Text style={community.memberSheetStatLabel}>CARDS</Text>
                          </View>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.quizAnswerCount)}</Text>
                            <Text style={community.memberSheetStatLabel}>QUIZZES</Text>
                          </View>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.testAnswerCount)}</Text>
                            <Text style={community.memberSheetStatLabel}>TESTS</Text>
                          </View>
                          <View style={community.memberSheetStat}>
                            <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.gameAnswerCount)}</Text>
                            <Text style={community.memberSheetStatLabel}>GAMES</Text>
                          </View>
                        </>
                      ) : collectorMetric === 'streaks' ? (
                        <View style={community.memberSheetStat}>
                          <Text style={community.memberSheetStatValue}>{formatPublicStat(selectedCollectorEntry.streakDays ?? selectedCollectorEntry.metricValue)}</Text>
                          <Text style={community.memberSheetStatLabel}>STREAK DAYS</Text>
                        </View>
                      ) : null}
                      <View style={community.memberSheetStat}>
                        <Text style={community.memberSheetStatValue}>#{selectedCollectorEntry.rank}</Text>
                        <Text style={community.memberSheetStatLabel}>RANK</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                {selectedLeaderboardEntry.isMe ? (
                  <View style={[community.memberSheetInfo, community.memberSheetInfoOwn]}>
                    <Ionicons name="sparkles-outline" size={15} color={COLORS.purpleDark} />
                    <Text style={community.memberSheetInfoText}>This is your public Connect profile. Keep learning anywhere in WordWiz to grow your Social XP.</Text>
                  </View>
                ) : selectedConnection?.status === 'accepted' ? (
                  <View style={community.nudgePicker}>
                    <Text style={community.nudgePickerTitle}>Send a nudge</Text>
                    <Text style={community.nudgePickerHelp}>Choose a friendly message for {selectedLeaderboardEntry.displayName}.</Text>
                    <ScrollView style={community.nudgePickerScroll} contentContainerStyle={community.nudgePickerScrollContent} showsVerticalScrollIndicator={false}>
                      {NUDGE_GROUPS.map((group) => {
                        const expanded = expandedNudgeCategory === group.group;
                        return (
                        <View key={group.group} style={community.nudgePickerGroup}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ expanded }}
                            onPress={() => setExpandedNudgeCategory((current) => current === group.group ? null : group.group)}
                            style={[community.nudgeCategoryTrigger, expanded && community.nudgeCategoryTriggerExpanded]}
                          >
                            <View style={[community.nudgePickerGroupIcon, { backgroundColor: group.background }]}>
                              <Ionicons name={group.icon} size={15} color={group.color} />
                            </View>
                            <View style={community.nudgeCategoryCopy}>
                              <Text style={community.nudgePickerGroupText}>{group.group}</Text>
                              <Text style={community.nudgeCategoryCount}>{group.options.length} messages</Text>
                            </View>
                            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.muted} />
                          </Pressable>
                          {expanded ? group.options.map((option) => (
                            <Pressable
                              key={option.key}
                              disabled={leaderboardActionLoading}
                              onPress={() => void sendLeaderboardNudge(option)}
                              style={({ pressed }) => [community.nudgeOption, pressed && community.nudgeOptionPressed, leaderboardActionLoading && community.disabledButton]}
                            >
                              <View style={[community.nudgeOptionIcon, { backgroundColor: option.background }]}>
                                <Ionicons name={option.icon} size={18} color={option.color} />
                              </View>
                              <Text style={community.nudgeOptionTitle}>{option.title}</Text>
                              <Ionicons name="chevron-forward" size={17} color={COLORS.muted} />
                            </Pressable>
                          )) : null}
                        </View>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : selectedConnection ? (
                  <View style={community.memberSheetNotice}>
                    <Ionicons name="time-outline" size={18} color={COLORS.purpleDark} />
                    <Text style={community.memberSheetNoticeText}>
                      {selectedConnection.direction === 'incoming' ? 'This person wants to connect. Accept their request in Friends to send nudges.' : 'Connection request sent. You can send nudges once they accept.'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={community.memberSheetInfo}>
                      <Ionicons name="people-outline" size={15} color={COLORS.purpleDark} />
                      <Text style={community.memberSheetInfoText}>Connect first, then you can send friendly study nudges whenever it makes sense.</Text>
                    </View>
                    <Pressable
                      disabled={leaderboardActionLoading}
                      onPress={() => void addLeaderboardFriend()}
                      style={({ pressed }) => [community.memberSheetPrimary, pressed && community.memberSheetPrimaryPressed, leaderboardActionLoading && community.disabledButton]}
                    >
                      {leaderboardActionLoading ? <ActivityIndicator color={COLORS.white} /> : <><Ionicons name="person-add-outline" size={18} color={COLORS.white} /><Text style={community.memberSheetPrimaryText}>Connect</Text></>}
                    </Pressable>
                  </>
                )}
                {!selectedLeaderboardEntry.isMe ? (
                  <>
                  <Pressable
                    disabled={leaderboardActionLoading}
                    onPress={() => Alert.alert(
                      'Block user?',
                      `Block ${selectedLeaderboardEntry.displayName}? They will no longer be able to connect with or nudge you.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Block', style: 'destructive', onPress: () => void blockLeaderboardMember() },
                      ],
                    )}
                    style={({ pressed }) => [community.memberSheetBlock, pressed && community.memberSheetBlockPressed, leaderboardActionLoading && community.disabledButton]}
                >
                  <Ionicons name="ban-outline" size={17} color="#D9627C" />
                  <Text style={community.memberSheetBlockText}>Block user</Text>
                </Pressable>
                <Pressable
                  disabled={leaderboardActionLoading}
                  onPress={() => Alert.alert(
                    'Report user',
                    'What is the reason for this report?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Harassment', onPress: () => void reportLeaderboardMember('harassment') },
                      { text: 'Spam', onPress: () => void reportLeaderboardMember('spam') },
                      { text: 'Inappropriate photo', onPress: () => void reportLeaderboardMember('inappropriate_avatar') },
                      { text: 'Inappropriate name', onPress: () => void reportLeaderboardMember('inappropriate_name') },
                      { text: 'Other', onPress: () => void reportLeaderboardMember('other') },
                    ],
                  )}
                  style={({ pressed }) => [community.memberSheetReport, pressed && community.memberSheetReportPressed, leaderboardActionLoading && community.disabledButton]}
                >
                  <Ionicons name="flag-outline" size={17} color={COLORS.muted} />
                  <Text style={community.memberSheetReportText}>Report user</Text>
                </Pressable>
                  </>
              ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const community = StyleSheet.create({
  container: { padding: 18, paddingBottom: 122, gap: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontWeight: '700' },
  hero: { padding: 20, borderRadius: 24, backgroundColor: COLORS.purplePale, borderWidth: 1, borderColor: '#D8CFFF', gap: 8 },
  heroTitle: { color: COLORS.ink, fontSize: 25, fontWeight: '900' },
  heroText: { color: COLORS.muted, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  fieldLabel: { marginTop: 8, color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, paddingHorizontal: 16, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.white, color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  preference: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  preferenceCopy: { flex: 1, gap: 3 },
  preferenceTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  preferenceTitle: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  preferenceStatus: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, overflow: 'hidden', borderWidth: 1, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.8 },
  preferenceStatusActive: { color: '#237C63', backgroundColor: '#E2F8EF', borderColor: '#C5F0E1' },
  preferenceStatusInactive: { color: '#655D85', backgroundColor: '#F0EDF8', borderColor: '#E3DDF2' },
  preferenceDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  primaryButton: { minHeight: 54, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.blue, ...SOFT_SHADOW },
  primaryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  disabledButton: { opacity: 0.48 },
  profileSetupPromptBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31, 33, 70, 0.38)' },
  profileSetupPromptCard: { width: '100%', maxWidth: 390, alignItems: 'center', padding: 24, borderRadius: 28, backgroundColor: COLORS.surface, ...SOFT_SHADOW },
  profileSetupPromptIcon: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderRadius: 24, overflow: 'hidden', backgroundColor: COLORS.purplePale },
  profileSetupPromptEyebrow: { color: COLORS.purple, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  profileSetupPromptTitle: { marginTop: 6, color: COLORS.ink, fontSize: 24, lineHeight: 29, fontWeight: '900', textAlign: 'center' },
  profileSetupPromptText: { marginTop: 9, color: COLORS.muted, fontSize: 15, lineHeight: 21, fontWeight: '600', textAlign: 'center' },
  profileSetupPromptPrimary: { width: '100%', minHeight: 52, marginTop: 20, overflow: 'hidden', borderRadius: 17, ...SOFT_SHADOW },
  profileSetupPromptPrimaryGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  profileSetupPromptPrimaryText: { color: COLORS.purpleDark, fontSize: 16, fontWeight: '900' },
  profileSetupPromptSecondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  profileSetupPromptSecondaryText: { color: COLORS.muted, fontSize: 14, fontWeight: '800' },
  profileSetupPromptPressed: { opacity: 0.78 },
  profileHeader: { position: 'relative', alignItems: 'center', padding: 20, borderRadius: 28, backgroundColor: '#F8F6FF', borderWidth: 1, borderColor: '#DDD4FF', gap: 17, ...SOFT_SHADOW },
  profileHeaderTop: { alignItems: 'center', gap: 7 },
  profileSettings: { position: 'absolute', top: 15, right: 15, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  privateProfileNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: '#D8D0FF', backgroundColor: '#F4F0FF' },
  privateProfileNoticePressed: { opacity: 0.78 },
  privateProfileNoticeIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.white },
  privateProfileNoticeCopy: { flex: 1, gap: 2 },
  privateProfileNoticeTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  privateProfileNoticeText: { color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLORS.purplePale },
  avatarSmall: { width: 38, height: 38, borderRadius: 14 },
  avatarLarge: { width: 70, height: 70, borderRadius: 25, backgroundColor: COLORS.white },
  avatarImage: { width: '100%', height: '100%' },
  avatarPress: { position: 'relative' },
  avatarEdit: { position: 'absolute', right: -3, bottom: -3, width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleDark, borderWidth: 2, borderColor: COLORS.white },
  avatarText: { color: COLORS.purpleDark, fontSize: 22, fontWeight: '900' },
  avatarTextSmall: { fontSize: 17 },
  avatarTextLarge: { fontSize: 31 },
  profileCopy: { alignItems: 'center', gap: 2 },
  profileEyebrow: { color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  profileName: { color: COLORS.ink, fontSize: 23, fontWeight: '900', lineHeight: 28, textAlign: 'center' },
  photoAction: { marginBottom: 44, color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  profileStats: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 15, borderTopWidth: 1, borderTopColor: '#EEE9FA' },
  profileStat: { alignItems: 'center', gap: 1 },
  profileStatValue: { color: COLORS.greenDark, fontSize: 25, fontWeight: '900', lineHeight: 29 },
  profileStatLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  profileStatLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  profileXpInfoButton: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  profileRank: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: '#FFF5DE' },
  profileRankText: { color: '#966913', fontSize: 12, fontWeight: '900' },
  nav: { flexDirection: 'row', borderRadius: 19, backgroundColor: '#EEEAF8', padding: 4, borderWidth: 1, borderColor: '#E3DDF5' },
  navItem: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 3, borderRadius: 15 },
  navItemActive: { backgroundColor: COLORS.white, ...SOFT_SHADOW },
  navItemPressed: { opacity: 0.78 },
  navIcon: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E0F2' },
  navIconActive: { backgroundColor: '#EAE4FF' },
  navText: { flexShrink: 1, color: COLORS.muted, fontSize: 16, fontWeight: '800' },
  navTextActive: { color: COLORS.purpleDark, fontSize: 17, fontWeight: '900' },
  periods: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  segmentActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: COLORS.white },
  socialPeriods: { flexDirection: 'row', padding: 2, borderRadius: 16, backgroundColor: '#EEEAF8', borderWidth: 1, borderColor: '#E3DDF5' },
  socialSegment: { flex: 1, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  socialSegmentActive: { backgroundColor: COLORS.purple },
  socialSegmentText: { color: COLORS.muted, fontSize: 15, fontWeight: '800' },
  socialSegmentTextActive: { color: COLORS.white },
  tierLegend: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  tierLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tierLegendItemActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  tierLegendItemPressed: { opacity: 0.8 },
  tierLegendDot: { width: 8, height: 8, borderRadius: 4 },
  tierLegendText: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  tierLegendTextActive: { color: COLORS.white },
  tierLegendCount: { marginTop: 1, color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  tierLegendCountActive: { color: '#E7E1FF' },
  collectorDestination: { borderColor: '#BBD9F5', backgroundColor: '#F4FAFF', boxShadow: '0 4px 12px rgba(139, 193, 232, 0.12)', elevation: 2 },
  collectorDestinationActive: { borderColor: '#A6D2F0', backgroundColor: '#EAF6FF', boxShadow: '0 7px 16px rgba(139, 193, 232, 0.2)', elevation: 3 },
  collectorDestinationTextActive: { color: '#4E719B' },
  collectorDestinationCountActive: { color: '#7695B4' },
  collectorDestinationSparkle: { width: 17, height: 17, position: 'relative', flexShrink: 0 },
  collectorHero: { gap: 11, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: '#D8D0FF', backgroundColor: '#F8F5FF' },
  collectorHeroHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  collectorHeroIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#EAE4FF' },
  collectorHeroCopy: { flex: 1 },
  collectorHeroEyebrow: { color: COLORS.purple, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  collectorHeroTitle: { marginTop: 2, color: COLORS.ink, fontSize: 15, lineHeight: 20, fontWeight: '800' },
  collectorBackButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: COLORS.white },
  collectorBackButtonPressed: { opacity: 0.72 },
  collectorBackButtonText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '900' },
  metricTabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 18, borderWidth: 1, borderColor: '#E3DDF5', backgroundColor: '#F0EDF8' },
  metricTab: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3, borderRadius: 14 },
  metricTabActive: { backgroundColor: COLORS.white, ...SOFT_SHADOW },
  metricTabActiveStreak: { backgroundColor: '#F2FAF7' },
  metricTabPressed: { opacity: 0.78 },
  metricTabText: { color: COLORS.muted, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  collectorControlGroup: { gap: 6 },
  collectorControlLabel: { marginLeft: 3, color: COLORS.purpleDark, fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  collectorAudienceRow: { flexDirection: 'row', gap: 6 },
  collectorAudience: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  collectorAudienceActive: { borderColor: COLORS.blue, backgroundColor: '#EAF6FF' },
  collectorAudienceText: { color: COLORS.muted, fontSize: 11, fontWeight: '900' },
  collectorAudienceTextActive: { color: COLORS.blue },
  collectorMyRankCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: '#C9E2F8', backgroundColor: '#F3F9FF' },
  collectorMyRankCopy: { flex: 1, minWidth: 0 },
  collectorMyRankValue: { marginTop: 2, color: COLORS.ink, fontSize: 21, lineHeight: 25, fontWeight: '900' },
  collectorMyRankDetail: { marginTop: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  collectorMyRankButton: { flexShrink: 0, minHeight: 35, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.blue },
  collectorMyRankButtonText: { color: COLORS.white, fontSize: 11, fontWeight: '900' },
  collectorMyRankLoadingCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: '#C9E2F8', backgroundColor: '#F3F9FF' },
  collectorMyRankLoadingCopy: { flex: 1, minWidth: 0, gap: 3 },
  collectorLoadingTitle: { color: COLORS.ink, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  collectorLoadingDetail: { color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  collectorLocationCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: '#C9E2F8', backgroundColor: '#F7FBFF' },
  collectorLocationIcon: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E5F4FF' },
  collectorLocationCopy: { flex: 1, minWidth: 210 },
  collectorLocationTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  collectorLocationText: { marginTop: 3, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  collectorLocationActions: { width: '100%', flexDirection: 'row', gap: 8 },
  collectorLocationPrimary: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 13, backgroundColor: COLORS.blue },
  collectorLocationPrimaryText: { color: COLORS.white, fontSize: 12, fontWeight: '900' },
  collectorLocationSecondary: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, backgroundColor: COLORS.white },
  collectorLocationSecondaryText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '900' },
  retentionQualificationCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: '#D8D0FF', backgroundColor: '#F8F5FF' },
  retentionQualificationIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#EAE4FF' },
  retentionQualificationCopy: { flex: 1 },
  retentionQualificationTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '900' },
  retentionQualificationText: { marginTop: 2, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  collectorRankRow: { minHeight: 74, paddingVertical: 11 },
  collectorTopRank: { borderColor: '#E5CC8E', backgroundColor: '#FFFAEE' },
  collectorRankNumber: { width: 31, flexShrink: 0, alignItems: 'center' },
  collectorMedal: { fontSize: 20 },
  collectorRankText: { color: COLORS.muted, fontSize: 12, fontWeight: '900' },
  collectorRowDetail: { marginTop: 2, color: COLORS.blue, fontSize: 11, lineHeight: 14, fontWeight: '900' },
  collectorBreakdownText: { marginTop: 1, color: '#7B7598', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  collectorReviewActivity: { marginTop: 3, color: '#7B7598', fontSize: 10, lineHeight: 13, fontWeight: '800' },
  collectorMetricValue: { width: 82, flexShrink: 0, alignItems: 'flex-end' },
  collectorWordCount: { maxWidth: '100%', color: COLORS.blue, fontSize: 14, fontWeight: '900', textAlign: 'right' },
  collectorLoadingRows: { gap: 5 },
  collectorLoadingRow: { borderColor: '#E3E8F0', backgroundColor: '#FBFCFE' },
  collectorLoadingRank: { width: 22, height: 12, flexShrink: 0, borderRadius: 6, backgroundColor: '#E6EAF1' },
  collectorLoadingAvatar: { width: 38, height: 38, flexShrink: 0, borderRadius: 14, backgroundColor: '#E8EDF4' },
  collectorLoadingCopy: { flex: 1, minWidth: 0, gap: 7 },
  collectorLoadingLine: { height: 10, borderRadius: 5, backgroundColor: '#E6EAF1' },
  collectorLoadingLineName: { width: '72%' },
  collectorLoadingLineDetail: { width: '48%', height: 8 },
  collectorLoadingScore: { width: 30, height: 14, flexShrink: 0, borderRadius: 7, backgroundColor: '#E6EAF1' },
  collectorEmptyActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  collectorEmptyButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#EAE4FF' },
  collectorEmptyButtonText: { color: COLORS.purpleDark, fontSize: 11, fontWeight: '900' },
  collectorReturnTop: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 9 },
  collectorReturnTopText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '900' },
  scoreExplainer: { borderWidth: 1, borderColor: '#DDD4FF', borderRadius: 19, backgroundColor: '#F8F5FF', overflow: 'hidden' },
  scoreExplainerTrigger: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10 },
  scoreExplainerIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAE4FF' },
  scoreExplainerCopy: { flex: 1 },
  scoreExplainerTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  scoreExplainerSubtitle: { marginTop: 1, color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  scoreSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 33, 70, 0.33)' },
  scoreSheet: { maxHeight: '82%', padding: 18, paddingTop: 12, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: COLORS.surface, gap: 12 },
  scoreSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#D8D2E8' },
  scoreSheetClose: { position: 'absolute', top: 18, right: 14, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F4F1FA' },
  scoreSheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 40 },
  scoreSheetTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  scoreSheetSubtitle: { marginTop: 1, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  scoreSheetDetails: { gap: 2 },
  scoreDetails: { gap: 12, paddingHorizontal: 13, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#E4DDFA' },
  scoreRule: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  scoreRuleIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  scoreRuleIconQuiz: { backgroundColor: '#EFEAFF' },
  scoreRuleIconOmega: { backgroundColor: '#E7F3FF' },
  scoreRuleIconCards: { backgroundColor: '#E5F8F0' },
  scoreRuleIconRank: { backgroundColor: '#E7F3FF' },
  scoreRuleCopy: { flex: 1 },
  scoreRuleTitle: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  scoreRuleText: { marginTop: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  scoreSystemNote: { marginTop: 1, padding: 11, borderRadius: 13, backgroundColor: COLORS.white },
  scoreSystemNoteText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 17, backgroundColor: COLORS.yellowPale },
  noticeText: { flex: 1, color: '#936C0D', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  leaderboardStatus: { minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 3 },
  leaderboardStatusText: { flex: 1, minWidth: 0, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  rankRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.surface },
  rankRowAfter: { marginTop: 5 },
  rankRowMe: { borderColor: '#B6DBFF', backgroundColor: '#F3F9FF' },
  rankRowChampion: { overflow: 'hidden', borderColor: '#C9BFFF', backgroundColor: 'transparent', boxShadow: '0 4px 14px rgba(116, 98, 232, 0.14)' },
  rankRowGold: { borderColor: '#E6C66F', backgroundColor: '#FFFAEE' },
  rankRowSilver: { borderColor: '#D0D9E6', backgroundColor: '#F7FAFF' },
  rankRowBronze: { borderColor: '#DEB398', backgroundColor: '#FFF4ED' },
  rankRowChampionBackdrop: { ...StyleSheet.absoluteFill, borderRadius: 17 },
  rankRowPressed: { opacity: 0.78, transform: [{ scale: 0.992 }] },
  rankOneAvatarFrame: { padding: 2, borderRadius: 16, backgroundColor: '#EEE9FF', boxShadow: '0 4px 12px rgba(116, 98, 232, 0.20)' },
  rankWordWizardIcon: { width: 13, height: 13, borderRadius: 4 },
  rankName: { flex: 1, minWidth: 0 },
  rankNameText: { minWidth: 0, color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  rankDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankDetail: { fontSize: 11, fontWeight: '800' },
  rankDetailDivider: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  rankSocialXp: { color: COLORS.greenDark, fontSize: 11, fontWeight: '900' },
  myLeaderboardCard: { gap: 7 },
  myLeaderboardEyebrow: { marginLeft: 3, color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  xp: { color: COLORS.blue, fontSize: 16, fontWeight: '900' },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  tierBadgeCompact: { marginTop: 0, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9 },
  tierBadgeModal: { marginTop: 0, paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1, borderRadius: 13 },
  tierBadgeAppIcon: { width: 13, height: 13, borderRadius: 4 },
  tierBadgeAppIconCompact: { width: 12, height: 12, borderRadius: 4 },
  tierBadgeText: { fontSize: 12, fontWeight: '900' },
  tierBadgeTextCompact: { fontSize: 10 },
  empty: { alignItems: 'center', padding: 26, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 8 },
  emptyTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginTop: 5 },
  pageLink: { color: COLORS.purpleDark, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  pageLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  loadMore: { minHeight: 58, marginTop: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#DED6FA', borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F5FF' },
  loadMorePressed: { opacity: 0.72 },
  loadMoreCopy: { flex: 1 },
  loadMoreTitle: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '900' },
  loadMoreText: { marginTop: 2, color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  leaderboardEnd: { marginTop: 13, color: COLORS.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  memberSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 33, 70, 0.33)' },
  memberSheetScroll: { maxHeight: '84%', flexGrow: 0, flexShrink: 1, alignSelf: 'stretch', overflow: 'hidden', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: COLORS.surface, boxShadow: '0 -8px 22px rgba(41, 35, 80, 0.10)' },
  memberSheet: { alignItems: 'center', padding: 22, paddingTop: 27, paddingBottom: 40, gap: 7 },
  memberSheetHandle: { position: 'absolute', top: 10, width: 38, height: 4, borderRadius: 2, backgroundColor: '#D8D2E8' },
  memberSheetClose: { position: 'absolute', top: 13, right: 14, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F4F1FA' },
  memberSheetIdentity: { alignItems: 'center', gap: 5 },
  memberSheetAvatarRing: { padding: 2, borderWidth: 2, borderRadius: 29, backgroundColor: COLORS.white, boxShadow: '0 4px 12px rgba(72, 61, 135, 0.10)' },
  memberSheetAvatarRingGrandmaster: { borderColor: '#D9A72B', boxShadow: '0 5px 15px rgba(185, 132, 22, 0.20)' },
  memberSheetName: { color: COLORS.ink, fontSize: 22, lineHeight: 27, fontWeight: '900', textAlign: 'center' },
  memberSheetCollectorBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderRadius: 13 },
  memberSheetCollectorBadgeText: { fontSize: 11, fontWeight: '900' },
  memberSheetScore: { color: COLORS.muted, fontSize: 13, lineHeight: 17, fontWeight: '800' },
  memberSheetRank: { color: COLORS.ink, fontWeight: '900' },
  memberSheetScoreSeparator: { color: '#B3ABC9', fontWeight: '700' },
  memberSheetStats: { width: '100%', marginTop: 4, padding: 10, borderWidth: 1, borderColor: '#E9E2F7', borderRadius: 20, backgroundColor: '#F8F5FF', gap: 7 },
  memberSheetStatsTitle: { marginLeft: 3, color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  memberSheetStatsGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  memberSheetStat: { minWidth: '28%', minHeight: 53, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.72)' },
  memberSheetStatValue: { color: COLORS.greenDark, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  memberSheetStatLabel: { marginTop: 2, color: COLORS.muted, fontSize: 8, lineHeight: 10, fontWeight: '900', letterSpacing: 0.45, textAlign: 'center' },
  memberSheetStatCaption: { marginTop: 1, color: '#9A92B3', fontSize: 7, lineHeight: 9, fontWeight: '700', textAlign: 'center' },
  memberSheetInfo: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#F7F4FF' },
  memberSheetInfoOwn: { backgroundColor: '#F4F7FF' },
  memberSheetInfoText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  memberSheetPrimary: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 2, borderRadius: 16, backgroundColor: COLORS.purpleDark, ...SOFT_SHADOW },
  memberSheetPrimaryPressed: { opacity: 0.94, transform: [{ scale: 0.986 }] },
  memberSheetPrimaryText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  memberSheetNotice: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, padding: 13, borderRadius: 15, backgroundColor: COLORS.purplePale },
  memberSheetNoticeText: { flex: 1, color: COLORS.purpleDark, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  memberSheetBlock: { width: '100%', minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F0CBD4', backgroundColor: '#FFF7F8' },
  memberSheetBlockPressed: { opacity: 0.76 },
  memberSheetBlockText: { color: '#C94D69', fontSize: 13, fontWeight: '900' },
  memberSheetReport: { width: '100%', minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 8, borderRadius: 14 },
  memberSheetReportPressed: { opacity: 0.62 },
  memberSheetReportText: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  friendNudgeBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 33, 70, 0.33)' },
  friendNudgeSheet: { maxHeight: '84%', padding: 18, paddingTop: 28, paddingBottom: 30, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: COLORS.surface, gap: 12, ...SOFT_SHADOW },
  friendNudgeHandle: { position: 'absolute', top: 10, alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#D8D2E8' },
  friendNudgeHeader: { position: 'relative', minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingRight: 52, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E9E2F7' },
  friendNudgeHeading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  friendNudgeHeadingCopy: { flex: 1, minWidth: 0 },
  friendNudgeTitle: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  friendNudgeHelp: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  friendNudgeClose: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#E3DDF5', backgroundColor: '#F4F1FA' },
  friendNudgeScroll: { width: '100%' },
  friendGoldenNudgeCard: { borderColor: '#E3BB50' },
  nudgePicker: { width: '100%', marginTop: 8, gap: 8 },
  nudgePickerTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  nudgePickerHelp: { color: COLORS.muted, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  nudgePickerScroll: { width: '100%', maxHeight: 344 },
  nudgePickerScrollContent: { gap: 12, paddingBottom: 4 },
  nudgePickerGroup: { gap: 6 },
  nudgePickerGroupTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 4 },
  nudgePickerGroupIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  nudgePickerGroupText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  nudgeOption: { width: '100%', minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  nudgeOptionPressed: { opacity: 0.74 },
  nudgeOptionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  nudgeOptionTitle: { flex: 1, color: COLORS.ink, fontSize: 13, lineHeight: 18, fontWeight: '900' },
  codeCard: { alignItems: 'center', padding: 20, borderRadius: 20, backgroundColor: COLORS.purplePale, borderWidth: 1, borderColor: '#D9D0FF' },
  eyebrow: { color: COLORS.purpleDark, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  code: { marginTop: 5, color: COLORS.ink, fontSize: 30, letterSpacing: 2.5, fontWeight: '900' },
  codeHelp: { marginTop: 5, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  addFriend: { flexDirection: 'row', gap: 8 },
  friendInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white, color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  smallPrimary: { paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.blue },
  smallPrimaryText: { color: COLORS.white, fontSize: 14, fontWeight: '900' },
  friendListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 3 },
  friendListTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '900' },
  friendSortButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: '#D9D0FF', backgroundColor: '#F8F5FF' },
  friendSortButtonPressed: { opacity: 0.72 },
  friendSortText: { color: COLORS.purpleDark, fontSize: 11, fontWeight: '900' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  friendInfo: { flex: 1 },
  friendName: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  friendDetail: { marginTop: 2, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  friendAdded: { marginTop: 3, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '600' },
  friendActions: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  accept: { color: COLORS.greenDark, fontSize: 13, fontWeight: '900' },
  subtleAction: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  nudgeUnread: { backgroundColor: '#F6F3FF', borderColor: '#D6CBFF' },
  nudgeComposer: { gap: 10, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#DDD4FF', backgroundColor: '#F8F5FF' },
  nudgeComposerHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nudgeComposerHeaderPressed: { opacity: 0.76 },
  nudgeComposerIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EAE4FF' },
  nudgeComposerHeadingCopy: { flex: 1 },
  nudgeComposerTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  nudgeComposerHelp: { marginTop: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeComposerLabel: { marginTop: 3, color: COLORS.purpleDark, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
  nudgeRecipientSearch: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  nudgeRecipientSearchInput: { flex: 1, minWidth: 0, paddingVertical: 8, color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  nudgeRecipientList: { gap: 7, paddingRight: 2 },
  nudgeRecipient: { maxWidth: 112, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  nudgeRecipientSelected: { borderColor: COLORS.purple, backgroundColor: '#EEE9FF' },
  nudgeRecipientText: { flexShrink: 1, color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  nudgeRecipientTextSelected: { color: COLORS.purpleDark },
  nudgeNoRecipient: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 13, backgroundColor: COLORS.white },
  nudgeNoRecipientText: { flex: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeComposerGroup: { gap: 6 },
  nudgeCategoryTrigger: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.white },
  nudgeCategoryTriggerExpanded: { borderColor: '#D8CCFF', backgroundColor: '#FCFBFF' },
  nudgeCategoryCopy: { flex: 1 },
  nudgeCategoryCount: { marginTop: 1, color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  nudgeOptionUnavailable: { opacity: 0.68 },
  goldenNudgeCard: { minHeight: 64, position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: '#D3C1FF', backgroundColor: 'transparent' },
  goldenNudgeCardGradient: { ...StyleSheet.absoluteFill, borderRadius: 15 },
  goldenNudgeCardOpen: { borderColor: '#D9AA3B', boxShadow: '0 3px 10px rgba(185, 132, 22, 0.10)' },
  goldenNudgeCardPressed: { opacity: 0.78 },
  goldenNudgeUnavailable: { opacity: 0.62 },
  goldenNudgeIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E9C96A', backgroundColor: '#FFF1C2' },
  goldenNudgeCopy: { flex: 1 },
  goldenNudgeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  goldenNudgeTitle: { color: '#8F6510', fontSize: 14, fontWeight: '900' },
  goldenNudgeCount: { color: '#B98416', fontSize: 10, fontWeight: '900' },
  goldenNudgeHelp: { marginTop: 2, color: '#9A8251', fontSize: 11, lineHeight: 15, fontWeight: '600' },
  goldenNudgeEditor: { gap: 9, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: '#E3BB50', backgroundColor: '#FFF8DF', boxShadow: '0 4px 12px rgba(185, 132, 22, 0.12)' },
  goldenNudgeEditorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  goldenNudgeEditorTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  goldenNudgeEditorTitle: { color: '#8F6510', fontSize: 13, fontWeight: '900' },
  goldenNudgeInput: { minHeight: 92, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 13, borderWidth: 1, borderColor: '#E7CB78', backgroundColor: '#FFFEF8', color: COLORS.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  goldenNudgeEditorFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  goldenNudgeCharacterCount: { color: '#9A8251', fontSize: 11, fontWeight: '700' },
  goldenNudgeSend: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#C88714' },
  goldenNudgeSendPressed: { opacity: 0.78 },
  goldenNudgeSendDisabled: { opacity: 0.45 },
  goldenNudgeSendText: { color: COLORS.white, fontSize: 11, fontWeight: '900' },
  nudgeInboxGroup: { gap: 7 },
  nudgeInboxGroupTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  nudgeInboxGroupIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  nudgeInboxGroupText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  nudgeText: { flex: 1, minWidth: 0 },
  nudgeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nudgeTitle: { flex: 1, minWidth: 0, color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  nudgeTimestamp: { flexShrink: 0, color: '#958DAF', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  nudgeDetail: { marginTop: 3, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeInboxEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  nudgeInboxEmptyCopy: { flex: 1 },
  nudgeInboxEmptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  nudgeInboxEmptyText: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeHistoryEnd: { marginTop: 13, color: COLORS.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple },
});
