import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, SOFT_SHADOW } from '../constants/theme';
import { LevelMagicIcon, MiniLeaderboardCrest } from '../components';
import {
  type CommunityConnection,
  type CommunityContext,
  type CommunityLeaderboardEntry,
  type CommunityLevel,
  type CommunityNudge,
  type CommunityPeriod,
  deactivateCommunityPushTokens,
  getCommunityAvatarUrl,
  getCommunityConnections,
  getCommunityContext,
  getCommunityExpoPushToken,
  getCommunityLeaderboard,
  getCommunityNudges,
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

const PAGE_SIZE = 10;
const PERIODS: CommunityPeriod[] = ['daily', 'weekly', 'all_time'];
const PERIOD_LABELS: Record<CommunityPeriod, string> = {
  daily: 'Today',
  weekly: 'This week',
  all_time: 'All time',
};
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
    ['learn_a_word', 'encouragement', '📚 Time to learn a word!', 'book-outline'], ['you_got_this', 'encouragement', '🌟 You’ve got this!', 'sparkles-outline'], ['magic_workout', 'encouragement', '✨ Give your WordWiz magic a quick workout', 'sparkles-outline'], ['keep_building', 'encouragement', '💪 Keep building that vocabulary', 'bar-chart-outline'], ['few_minutes', 'encouragement', '🚀 A few minutes can make a difference', 'rocket-outline'], ['learn_today', 'encouragement', '✨ Learn something new today', 'sparkles-outline'], ['keep_momentum', 'streak_reminder', '🔥 Keep your momentum going', 'flame-outline'], ['next_word_waiting', 'study_reminder', '🎯 Your next word is waiting', 'locate-outline'],
  ]),
  nudgeGroup('Study reminders', 'time-outline', COLORS.purpleDark, '#EEE9FF', [
    ['study_break', 'study_reminder', '⏰ Study break?', 'time-outline'], ['quick_review', 'study_reminder', '📝 Time for a quick review', 'create-outline'], ['flashcards_miss_you', 'study_reminder', '🃏 Your flashcards miss you', 'albums-outline'], ['quick_quiz', 'study_reminder', '🧩 Ready for a quick quiz?', 'help-circle-outline'], ['todays_words', 'study_reminder', '📖 Don’t forget today’s words', 'book-outline'], ['review_before_forget', 'study_reminder', '🔁 Review before you forget', 'repeat-outline'], ['recharge_spellbook', 'study_reminder', '🔮 Recharge your WordWiz spellbook', 'sparkles-outline'], ['new_word_day', 'study_reminder', '☀️ Start your day with a new word', 'sunny-outline'], ['last_review', 'study_reminder', '🌙 One last review before bed', 'moon-outline'],
  ]),
  nudgeGroup('Competitive nudges', 'trophy-outline', '#B98416', '#FFF1CB', [
    ['leaderboard_spot', 'five_word_challenge', '🏆 I’m coming for your leaderboard spot', 'trophy-outline'], ['right_behind', 'five_word_challenge', '👀 I’m right behind you', 'eye-outline'], ['catch_me', 'five_word_challenge', '⚡ Catch me if you can', 'flash-outline'], ['leaderboard_heating', 'five_word_challenge', '🔥 The leaderboard is heating up', 'flame-outline'], ['beat_score', 'five_word_challenge', '😏 Think you can beat my score?', 'speedometer-outline'], ['quiz_challenge', 'five_word_challenge', '🎯 Quiz challenge incoming', 'locate-outline'], ['who_knows_more', 'five_word_challenge', '🧠 Let’s see who knows more words', 'book-outline'], ['race_next_level', 'five_word_challenge', '🚀 Race you to the next level', 'rocket-outline'], ['top_spot_safe', 'five_word_challenge', '👑 Your top spot isn’t safe', 'ribbon-outline'], ['passed_you', 'five_word_challenge', '💥 I just passed you!', 'trending-up-outline'],
  ]),
  nudgeGroup('Challenge invitations', 'flash-outline', COLORS.blue, '#E5F4FF', [
    ['challenge_quiz', 'five_word_challenge', '⚔️ I challenge you to a quiz', 'flash-outline'], ['one_quiz_today', 'five_word_challenge', '🧩 Complete one quiz today', 'help-circle-outline'], ['three_words', 'five_word_challenge', '📚 Learn three new words with me', 'book-outline'], ['five_minutes', 'five_word_challenge', '⏱️ Five-minute study challenge', 'timer-outline'], ['streak_today', 'streak_reminder', '🔥 Keep your streak alive today', 'flame-outline'], ['earn_xp', 'five_word_challenge', '🎯 Try to earn 100 XP', 'star-outline'], ['flashcard_round', 'five_word_challenge', '🃏 Finish a flashcard round', 'albums-outline'], ['race_rank', 'five_word_challenge', '🏁 Race me to the next rank', 'flag-outline'], ['difficult_word', 'five_word_challenge', '💡 Learn one difficult word today', 'bulb-outline'], ['perfect_quiz', 'five_word_challenge', '🧠 Can you get a perfect quiz score?', 'medal-outline'],
  ]),
  nudgeGroup('Celebration nudges', 'sparkles-outline', '#C57A19', '#FFF2D9', [
    ['nice_work', 'encouragement', '🎉 Nice work!', 'sparkles-outline'], ['crushing_it', 'encouragement', '🥳 You’re crushing it', 'happy-outline'], ['great_quiz_score', 'encouragement', '👏 Great quiz score!', 'medal-outline'], ['vocabulary_growing', 'encouragement', '🌟 Your vocabulary is growing', 'trending-up-outline'], ['streak_impressive', 'encouragement', '🔥 That streak is impressive', 'flame-outline'], ['leaderboard_legend', 'encouragement', '🏆 Leaderboard legend', 'trophy-outline'], ['perfect_score', 'encouragement', '💯 Perfect score!', 'ribbon-outline'], ['leveled_up', 'encouragement', '🚀 You just leveled up', 'rocket-outline'], ['word_master', 'encouragement', '👑 Word master in the making', 'sparkles-outline'], ['spellbinding_energy', 'encouragement', '✨ Spellbinding energy!', 'sparkles-outline'],
  ]),
  nudgeGroup('Comeback nudges', 'reload-outline', '#5898D2', '#E5F2FF', [
    ['wordwiz_misses_you', 'study_reminder', '👋 WordWiz misses you', 'hand-left-outline'], ['comeback_word', 'study_reminder', '🌱 Every comeback starts with one word', 'leaf-outline'], ['restart_streak', 'streak_reminder', '🔄 Ready to restart your streak?', 'repeat-outline'], ['never_late', 'encouragement', '💪 It’s never too late to study', 'heart-outline'], ['jump_back', 'study_reminder', '📚 Jump back in with a quick review', 'book-outline'], ['fresh_start', 'encouragement', '✨ A fresh start is waiting', 'sparkles-outline'], ['wake_magic', 'study_reminder', '🪄 Wake up your WordWiz magic', 'sparkles-outline'], ['back_leaderboard', 'five_word_challenge', '🚀 Let’s get you back on the leaderboard', 'rocket-outline'],
  ]),
  nudgeGroup('Playful nudges', 'sparkles-outline', '#8067E8', '#EEE9FF', [
    ['owl_demands', 'study_reminder', '🦉 The WordWiz owl demands knowledge', 'eye-outline'], ['spellbook_called', 'study_reminder', '📜 Your spellbook called—it wants new words', 'book-outline'], ['vocabulary_asleep', 'study_reminder', '💤 Don’t let your vocabulary fall asleep', 'moon-outline'], ['scramble_words', 'study_reminder', '🍳 Time to scramble some words', 'shuffle-outline'], ['nerd_mode', 'encouragement', '🤓 Nerd mode: activated', 'sparkles-outline'], ['unstoppable', 'encouragement', '📖 Open WordWiz. Become unstoppable.', 'book-outline'], ['avoiding_flashcards', 'study_reminder', '👀 I saw you avoiding your flashcards', 'eye-outline'], ['yes_you', 'study_reminder', '🫵 Yes, you. Go study.', 'hand-left-outline'], ['one_quiz_hurt', 'five_word_challenge', '😂 One quiz won’t hurt', 'help-circle-outline'], ['powers_training', 'study_reminder', '🧙 Your word powers need training', 'sparkles-outline'],
  ]),
];
const NUDGE_OPTIONS = NUDGE_GROUPS.flatMap((group) => group.options);
const NUDGE_BY_KEY = new Map(NUDGE_OPTIONS.map((option) => [option.key, option]));
const LEGACY_NUDGE_KEYS: Record<CommunityNudge['nudgeType'], string> = {
  study_reminder: 'study_break',
  streak_reminder: 'keep_momentum',
  five_word_challenge: 'quiz_challenge',
  encouragement: 'you_got_this',
};

function nudgeOptionFor(nudge: CommunityNudge) {
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

function cacheKey(period: CommunityPeriod, page: number, level: CommunityLevel | null) {
  return `${period}:${level ?? 'all'}:${page}`;
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

function TierBadge({ level, compact = false }: { level: CommunityLevel; compact?: boolean }) {
  const tier = levelPresentation(level);
  return (
    <View style={[community.tierBadge, compact && community.tierBadgeCompact, { backgroundColor: tier.background }]}>
      <LevelPresentationIcon level={level} size={compact ? 12 : 13} />
      <Text style={[community.tierBadgeText, compact && community.tierBadgeTextCompact, { color: tier.color }]}>{tier.name}</Text>
    </View>
  );
}

function Preference({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={community.preference}>
      <View style={community.preferenceCopy}>
        <Text style={community.preferenceTitle}>{label}</Text>
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

function ScoreExplainer() {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={community.scoreExplainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={community.scoreExplainerTrigger}
      >
        <View style={community.scoreExplainerIcon}>
          <Ionicons name="information-circle-outline" size={21} color={COLORS.purpleDark} />
        </View>
        <View style={community.scoreExplainerCopy}>
          <Text style={community.scoreExplainerTitle}>How Social XP works</Text>
          <Text style={community.scoreExplainerSubtitle}>See how your activity adds to the leaderboard</Text>
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
            <Text style={community.scoreSystemNoteText}>
              Social XP is one shared score: learning, flashcard practice, regular quizzes, and Omega Tests all add to it automatically.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function CommunityScreen({ onUnreadNudgesChange }: { onUnreadNudgesChange?: (count: number) => void }) {
  const [section, setSection] = useState<CommunitySection>('leaderboard');
  const [period, setPeriod] = useState<CommunityPeriod>('weekly');
  const [context, setContext] = useState<CommunityContext | null>(null);
  const [leaderboard, setLeaderboard] = useState<CommunityLeaderboardEntry[]>([]);
  const [connections, setConnections] = useState<CommunityConnection[]>([]);
  const [nudges, setNudges] = useState<CommunityNudge[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState<CommunityLevel | null>(null);
  const [friendCode, setFriendCode] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileVisible, setProfileVisible] = useState(true);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(true);
  const [requestsEnabled, setRequestsEnabled] = useState(true);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [selectedLeaderboardEntry, setSelectedLeaderboardEntry] = useState<CommunityLeaderboardEntry | null>(null);
  const [leaderboardActionLoading, setLeaderboardActionLoading] = useState(false);
  const [selectedNudgeRecipientId, setSelectedNudgeRecipientId] = useState<string | null>(null);
  const [friendPage, setFriendPage] = useState(0);
  const [nudgePage, setNudgePage] = useState(0);
  const [expandedNudgeCategory, setExpandedNudgeCategory] = useState<string | null>(null);

  const leaderboardCacheRef = useRef(new Map<string, CommunityLeaderboardEntry[]>());
  const contextCacheRef = useRef(new Map<CommunityPeriod, CommunityContext>());
  const leaderboardRequestRef = useRef(0);
  const initializedRef = useRef(false);
  const profileEntrance = useRef(new Animated.Value(0)).current;
  const leaderboardEntrance = useRef(new Animated.Value(0)).current;

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
      applyContext(cachedContext);
      return;
    }

    if (cachedRows) setLeaderboard(cachedRows);
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
    const key = cacheKey(period, page, selectedLevel);
    const request = ++leaderboardRequestRef.current;
    const [nextContext, nextConnections, nextNudges, rows] = await Promise.all([
      getCommunityContext(period),
      getCommunityConnections(),
      getCommunityNudges(50),
      getCommunityLeaderboard(period, PAGE_SIZE, page * PAGE_SIZE, selectedLevel),
    ]);
    if (request !== leaderboardRequestRef.current) return;
    contextCacheRef.current.set(period, nextContext);
    leaderboardCacheRef.current.set(key, rows);
    applyContext(nextContext);
    setConnections(nextConnections);
    setNudges(nextNudges);
    setLeaderboard(rows);
  }, [applyContext, page, period, selectedLevel]);

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
  }, [leaderboard.length, leaderboardEntrance, period, section]);

  const selectLeaderboard = useCallback((
    nextPeriod: CommunityPeriod,
    nextPage = 0,
    nextLevel: CommunityLevel | null = selectedLevel,
  ) => {
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCommunity();
    } catch (error) {
      Alert.alert('Could not refresh Connect', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshCommunity]);

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

  const handleNudge = useCallback(async (friend: CommunityConnection) => {
    try {
      const option = NUDGE_BY_KEY.get('quick_review')!;
      await sendCommunityNudge(friend.publicId, option.type, option.key);
      Alert.alert('Nudge sent', `${option.title} was sent to ${friend.displayName}.`);
    } catch (error) {
      Alert.alert('Could not send nudge', error instanceof Error ? error.message : 'Please try again later.');
    }
  }, []);

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
    if (!context?.profile) return;
    setAvatarUpdating(true);
    try {
      const uploaded = await pickAndUploadCommunityAvatar(context.profile.avatarPath);
      if (uploaded) await refreshCommunity();
    } catch (error) {
      Alert.alert('Could not update picture', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setAvatarUpdating(false);
    }
  }, [context?.profile, refreshCommunity]);

  const runConnectionAction = useCallback(async (action: () => Promise<void>, title: string) => {
    try {
      await action();
      await refreshCommunity();
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : 'Please try again.');
    }
  }, [refreshCommunity]);

  const reportLeaderboardMember = useCallback(async (reason: 'harassment' | 'spam' | 'inappropriate_name' | 'other') => {
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
    setProfileName(context?.profile?.displayName ?? '');
    setContext(null);
  }, [context?.profile?.displayName]);

  const selectedConnection = selectedLeaderboardEntry
    ? connections.find((connection) => connection.publicId === selectedLeaderboardEntry.publicId)
    : undefined;
  const selectedTier = selectedLeaderboardEntry ? levelPresentation(selectedLeaderboardEntry.level) : null;
  const nudgeRecipients = connections.filter((connection) => connection.status === 'accepted');
  const selectedNudgeRecipient = nudgeRecipients.find((friend) => friend.publicId === selectedNudgeRecipientId) ?? nudgeRecipients[0];
  const friendPageCount = Math.ceil(connections.length / PAGE_SIZE);
  const nudgePageCount = Math.ceil(nudges.length / PAGE_SIZE);
  const activeFriendPage = Math.min(friendPage, Math.max(0, friendPageCount - 1));
  const activeNudgePage = Math.min(nudgePage, Math.max(0, nudgePageCount - 1));
  const visibleConnections = connections.slice(activeFriendPage * PAGE_SIZE, (activeFriendPage + 1) * PAGE_SIZE);
  const visibleNudges = nudges.slice(activeNudgePage * PAGE_SIZE, (activeNudgePage + 1) * PAGE_SIZE);

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

  const renderLeaderboard = () => (
    <>
      <View style={community.periods}>
        {PERIODS.map((item) => (
          <Pressable
            key={item}
            onPress={() => selectLeaderboard(item)}
            style={[community.segment, period === item && community.segmentActive]}
          >
            <Text style={[community.segmentText, period === item && community.segmentTextActive]}>
              {item === 'all_time' ? 'All time' : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={community.tierLegend}>
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
            onPress={() => selectLeaderboard(period, 0, selectedLevel === tierName ? null : tierName)}
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
      </ScrollView>
      <View style={community.myLeaderboardCard}>
        <Text style={community.myLeaderboardEyebrow}>YOUR LEADERBOARD STATUS</Text>
        <View style={[community.rankRow, community.rankRowMe]}>
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
              <LevelPresentationIcon level={context?.level ?? 'Novice'} size={12} />
              <Text style={[community.rankDetail, { color: levelPresentation(context?.level ?? 'Novice').color }]}>{context?.level ?? 'Novice'}</Text>
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
        {leaderboard.map((entry) => {
          const tier = levelPresentation(entry.level);
          return (
            <Pressable
              key={entry.publicId}
              accessibilityRole="button"
              accessibilityLabel={`Open ${entry.displayName}'s Connect profile`}
              onPress={() => setSelectedLeaderboardEntry(entry)}
              style={({ pressed }) => [community.rankRow, entry.isMe && community.rankRowMe, pressed && community.rankRowPressed]}
            >
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
                  <LevelPresentationIcon level={entry.level} size={12} />
                  <Text style={[community.rankDetail, { color: tier.color }]}>{tier.name}</Text>
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
        <View style={community.pagination}>
          <Pressable disabled={page === 0} onPress={() => selectLeaderboard(period, Math.max(0, page - 1), selectedLevel)}>
            <Text style={[community.pageLink, page === 0 && community.disabled]}>Previous</Text>
          </Pressable>
          <Text style={community.pageLabel}>Page {page + 1}</Text>
          <Pressable disabled={leaderboard.length < PAGE_SIZE} onPress={() => selectLeaderboard(period, page + 1, selectedLevel)}>
            <Text style={[community.pageLink, leaderboard.length < PAGE_SIZE && community.disabled]}>Next</Text>
          </Pressable>
        </View>
      </Animated.View>
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
              <Pressable onPress={() => void handleNudge(friend)}>
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
    const groupedNudges = NUDGE_GROUPS.map((group) => ({
      ...group,
      nudges: visibleNudges.filter((nudge) => nudgeOptionFor(nudge).group === group.group),
    })).filter((group) => group.nudges.length > 0);

    return (
      <>
        <View style={community.nudgeComposer}>
          <View style={community.nudgeComposerHeading}>
            <View style={community.nudgeComposerIcon}>
              <Ionicons name="paper-plane-outline" size={20} color={COLORS.purpleDark} />
            </View>
            <View style={community.nudgeComposerHeadingCopy}>
              <Text style={community.nudgeComposerTitle}>Send a nudge</Text>
              <Text style={community.nudgeComposerHelp}>Pick a friend, then choose a message that fits.</Text>
            </View>
          </View>
          {nudgeRecipients.length ? (
            <>
              <Text style={community.nudgeComposerLabel}>TO</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={community.nudgeRecipientList}>
                {nudgeRecipients.map((friend) => {
                  const selected = friend.publicId === selectedNudgeRecipient?.publicId;
                  return (
                    <Pressable
                      key={friend.publicId}
                      onPress={() => setSelectedNudgeRecipientId(friend.publicId)}
                      style={[community.nudgeRecipient, selected && community.nudgeRecipientSelected]}
                    >
                      <CommunityAvatar name={friend.displayName} avatarPath={friend.avatarPath} small />
                      <Text numberOfLines={1} style={[community.nudgeRecipientText, selected && community.nudgeRecipientTextSelected]}>{friend.displayName}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
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
                    <Text style={community.nudgeTitle}>{nudge.senderName} sent you a nudge</Text>
                    <Text style={community.nudgeDetail}>{option.title}</Text>
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
      <ScrollView contentContainerStyle={community.container}>
        <View style={community.hero}>
          <Ionicons name="people" size={28} color={COLORS.purpleDark} />
          <Text style={community.heroTitle}>Connect with learners</Text>
          <Text style={community.heroText}>Create a public display name to join optional rankings and connect with friends. Your words, definitions, and learning data stay private.</Text>
        </View>
        <Text style={community.fieldLabel}>Display name</Text>
        <TextInput value={profileName} onChangeText={setProfileName} placeholder="3–24 characters" placeholderTextColor={COLORS.muted} style={community.input} maxLength={24} />
        <Preference label="Show my Connect profile" detail="Turn this off to stay out of public profiles and leaderboards. Friends can still connect privately." value={profileVisible} onChange={setProfileVisible} />
        <Preference label="Appear on leaderboards" detail="Optional. You can still use friends privately." value={leaderboardOptIn} onChange={setLeaderboardOptIn} />
        <Preference label="Allow friend requests" detail="People need your code to find you." value={requestsEnabled} onChange={setRequestsEnabled} />
        <Preference label="Allow study nudges" detail="Friends can send a gentle reminder." value={nudgesEnabled} onChange={setNudgesEnabled} />
        <Preference label="Push nudges" detail="We will ask for notification permission only after setup." value={pushEnabled} onChange={setPushEnabled} />
        <Pressable disabled={saving || profileName.trim().length < 3} style={[community.primaryButton, (saving || profileName.trim().length < 3) && community.disabledButton]} onPress={() => void saveProfile()}>
          <Text style={community.primaryButtonText}>{saving ? 'Creating profile…' : 'Create Connect profile'}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={community.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
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
        <Pressable onPress={openProfileEditor} accessibilityLabel="Edit Connect profile" hitSlop={8} style={community.profileSettings}>
          <Ionicons name="settings-outline" size={23} color={COLORS.purpleDark} />
        </Pressable>
        <View style={community.profileHeaderTop}>
          <Pressable onPress={() => void updateAvatar()} accessibilityLabel="Add or update profile picture" style={community.avatarPress}>
            <CommunityAvatar name={context.profile.displayName} avatarPath={context.profile.avatarPath} large />
            <View style={community.avatarEdit}>
              <Ionicons name={avatarUpdating ? 'hourglass-outline' : 'camera'} size={13} color={COLORS.white} />
            </View>
          </Pressable>
          <View style={community.profileCopy}>
            <Text style={community.profileEyebrow}>YOUR LEARNING PROFILE</Text>
            <Text style={community.profileName}>{context.profile.displayName}</Text>
            <Text style={community.photoAction}>{avatarUpdating ? 'Updating picture…' : context.profile.avatarPath ? 'Tap your photo to change it' : 'Tap your photo to add one'}</Text>
          </View>
        </View>
        <View style={community.profileStats}>
          <View style={community.profileStat}>
            <Text style={community.profileStatValue}>{context.xp.toLocaleString()}</Text>
            <Text style={community.profileStatLabel}>SOCIAL XP · {PERIOD_LABELS[period].toUpperCase()}</Text>
          </View>
          <View style={community.profileRank}>
            <Ionicons name="trophy-outline" size={17} color={COLORS.orange} />
            <Text style={community.profileRankText}>{context.rank ? `#${context.rank} ranking` : 'Private profile'}</Text>
          </View>
        </View>
      </Animated.View>
      <View style={community.nav}>
        {(['leaderboard', 'friends', 'nudges'] as CommunitySection[]).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item }}
            onPress={() => setSection(item)}
            style={({ pressed }) => [community.navItem, section === item && community.navItemActive, pressed && community.navItemPressed]}
          >
            <View style={[community.navIcon, section === item && community.navIconActive]}>
              <Ionicons
                name={item === 'leaderboard' ? 'trophy-outline' : item === 'friends' ? 'people-outline' : 'sparkles-outline'}
                size={14}
                color={section === item ? COLORS.purpleDark : COLORS.muted}
              />
            </View>
            <Text numberOfLines={1} style={[community.navText, section === item && community.navTextActive]}>
              {item === 'nudges' && context.unreadNudges ? `Nudges (${context.unreadNudges})` : item[0].toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === 'leaderboard' ? <ScoreExplainer /> : null}
      {section === 'leaderboard' ? renderLeaderboard() : section === 'friends' ? renderFriends() : renderNudges()}
      </ScrollView>
      <Modal
        visible={Boolean(selectedLeaderboardEntry)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedLeaderboardEntry(null)}
      >
        <View style={community.memberSheetBackdrop}>
          <View style={community.memberSheet}>
            <Pressable onPress={() => setSelectedLeaderboardEntry(null)} accessibilityLabel="Close profile" style={community.memberSheetClose}>
              <Ionicons name="close" size={20} color={COLORS.muted} />
            </Pressable>
            {selectedLeaderboardEntry && selectedTier ? (
              <>
                <CommunityAvatar name={selectedLeaderboardEntry.displayName} avatarPath={selectedLeaderboardEntry.avatarPath} large />
                <Text style={community.memberSheetName}>{selectedLeaderboardEntry.displayName}{selectedLeaderboardEntry.isMe ? ' (you)' : ''}</Text>
                <TierBadge level={selectedLeaderboardEntry.level} />
                <Text style={community.memberSheetScore}>#{selectedLeaderboardEntry.rank} · {selectedLeaderboardEntry.xp.toLocaleString()} Social XP</Text>
                <View style={community.memberSheetStats}>
                  <View style={community.memberSheetStat}>
                    <Text style={community.memberSheetStatValue}>{selectedLeaderboardEntry.wordCount.toLocaleString()}</Text>
                    <Text style={community.memberSheetStatLabel}>WORDS</Text>
                  </View>
                  <View style={community.memberSheetStat}>
                    <Text style={community.memberSheetStatValue}>{selectedLeaderboardEntry.achievementsUnlocked.toLocaleString()}</Text>
                    <Text style={community.memberSheetStatLabel}>UNLOCKED</Text>
                  </View>
                  <View style={community.memberSheetStat}>
                    <Text style={community.memberSheetStatValue}>{selectedLeaderboardEntry.quizCount.toLocaleString()}</Text>
                    <Text style={community.memberSheetStatLabel}>QUIZZES</Text>
                  </View>
                  <View style={community.memberSheetStat}>
                    <Text style={community.memberSheetStatValue}>{selectedLeaderboardEntry.flashcardReviewCount.toLocaleString()}</Text>
                    <Text style={community.memberSheetStatLabel}>CARD REVIEWS</Text>
                  </View>
                  <View style={community.memberSheetStat}>
                    <Text style={community.memberSheetStatValue}>{selectedLeaderboardEntry.activeStudyDays30d.toLocaleString()}</Text>
                    <Text style={community.memberSheetStatLabel}>ACTIVE DAYS · 30D</Text>
                  </View>
                </View>
                {selectedLeaderboardEntry.isMe ? (
                  <Text style={community.memberSheetHelp}>This is your public Connect profile. Keep learning anywhere in WordWiz to grow your Social XP.</Text>
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
                    <Text style={community.memberSheetHelp}>Connect first, then you can send friendly study nudges whenever it makes sense.</Text>
                    <Pressable disabled={leaderboardActionLoading} onPress={() => void addLeaderboardFriend()} style={[community.memberSheetPrimary, leaderboardActionLoading && community.disabledButton]}>
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
                    style={[community.memberSheetBlock, leaderboardActionLoading && community.disabledButton]}
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
                      { text: 'Inappropriate name', onPress: () => void reportLeaderboardMember('inappropriate_name') },
                      { text: 'Other', onPress: () => void reportLeaderboardMember('other') },
                    ],
                  )}
                  style={[community.memberSheetReport, leaderboardActionLoading && community.disabledButton]}
                >
                  <Ionicons name="flag-outline" size={17} color={COLORS.muted} />
                  <Text style={community.memberSheetReportText}>Report user</Text>
                </Pressable>
                  </>
              ) : null}
              </>
            ) : null}
          </View>
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
  preferenceTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  preferenceDetail: { color: COLORS.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  primaryButton: { minHeight: 54, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.blue, ...SOFT_SHADOW },
  primaryButtonText: { color: COLORS.white, fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  disabledButton: { opacity: 0.48 },
  profileHeader: { position: 'relative', alignItems: 'center', padding: 20, borderRadius: 28, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, gap: 17, ...SOFT_SHADOW },
  profileHeaderTop: { alignItems: 'center', gap: 7 },
  profileSettings: { position: 'absolute', top: 15, right: 15, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: COLORS.purplePale },
  avatarSmall: { width: 38, height: 38, borderRadius: 14 },
  avatarLarge: { width: 70, height: 70, borderRadius: 25 },
  avatarImage: { width: '100%', height: '100%' },
  avatarPress: { position: 'relative' },
  avatarEdit: { position: 'absolute', right: -3, bottom: -3, width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleDark, borderWidth: 2, borderColor: COLORS.white },
  avatarText: { color: COLORS.purpleDark, fontSize: 22, fontWeight: '900' },
  avatarTextSmall: { fontSize: 17 },
  avatarTextLarge: { fontSize: 31 },
  profileCopy: { alignItems: 'center', gap: 2 },
  profileEyebrow: { color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.05 },
  profileName: { color: COLORS.ink, fontSize: 23, fontWeight: '900', lineHeight: 28, textAlign: 'center' },
  photoAction: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  profileStats: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 15, borderTopWidth: 1, borderTopColor: '#EEE9FA' },
  profileStat: { alignItems: 'center', gap: 1 },
  profileStatValue: { color: COLORS.greenDark, fontSize: 25, fontWeight: '900', lineHeight: 29 },
  profileStatLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  profileRank: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14, backgroundColor: '#FFF5DE' },
  profileRankText: { color: '#966913', fontSize: 12, fontWeight: '900' },
  nav: { flexDirection: 'row', borderRadius: 18, backgroundColor: '#EEEAF8', padding: 4, borderWidth: 1, borderColor: '#E3DDF5' },
  navItem: { flex: 1, minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, borderRadius: 14 },
  navItemActive: { backgroundColor: COLORS.white, ...SOFT_SHADOW },
  navItemPressed: { opacity: 0.78 },
  navIcon: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E0F2' },
  navIconActive: { backgroundColor: '#EAE4FF' },
  navText: { flexShrink: 1, color: COLORS.muted, fontSize: 11, fontWeight: '900' },
  navTextActive: { color: COLORS.purpleDark },
  periods: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  segmentActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: COLORS.white },
  tierLegend: { flexDirection: 'row', gap: 7, paddingRight: 10 },
  tierLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 13, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tierLegendItemActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  tierLegendItemPressed: { opacity: 0.8 },
  tierLegendDot: { width: 8, height: 8, borderRadius: 4 },
  tierLegendText: { color: COLORS.muted, fontSize: 10, fontWeight: '900' },
  tierLegendTextActive: { color: COLORS.white },
  tierLegendCount: { marginTop: 1, color: COLORS.muted, fontSize: 9, fontWeight: '800' },
  tierLegendCountActive: { color: '#E7E1FF' },
  scoreExplainer: { borderWidth: 1, borderColor: '#DDD4FF', borderRadius: 19, backgroundColor: '#F8F5FF', overflow: 'hidden' },
  scoreExplainerTrigger: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13 },
  scoreExplainerIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAE4FF' },
  scoreExplainerCopy: { flex: 1 },
  scoreExplainerTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  scoreExplainerSubtitle: { marginTop: 1, color: COLORS.muted, fontSize: 11, fontWeight: '700' },
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
  leaderboardStatusText: { color: COLORS.muted, fontSize: 12, fontWeight: '800' },
  rankRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.surface },
  rankRowMe: { borderColor: '#B6DBFF', backgroundColor: '#F3F9FF' },
  rankRowPressed: { opacity: 0.78, transform: [{ scale: 0.992 }] },
  rankOneAvatarFrame: { padding: 2, borderRadius: 16, backgroundColor: '#D9A72B', boxShadow: '0 4px 12px rgba(185, 132, 22, 0.22)' },
  rankName: { flex: 1 },
  rankNameText: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  rankDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankDetail: { fontSize: 11, fontWeight: '800' },
  rankDetailDivider: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },
  rankSocialXp: { color: COLORS.greenDark, fontSize: 11, fontWeight: '900' },
  myLeaderboardCard: { gap: 7 },
  myLeaderboardEyebrow: { marginLeft: 3, color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 },
  xp: { color: COLORS.blue, fontSize: 16, fontWeight: '900' },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  tierBadgeCompact: { marginTop: 0, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9 },
  tierBadgeText: { fontSize: 12, fontWeight: '900' },
  tierBadgeTextCompact: { fontSize: 10 },
  empty: { alignItems: 'center', padding: 26, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 8 },
  emptyTitle: { color: COLORS.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginTop: 5 },
  pageLink: { color: COLORS.purpleDark, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  pageLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  memberSheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 33, 70, 0.33)' },
  memberSheet: { maxHeight: '84%', alignItems: 'center', padding: 22, paddingTop: 28, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: COLORS.surface, gap: 7 },
  memberSheetClose: { position: 'absolute', top: 13, right: 14, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F4F1FA' },
  memberSheetName: { marginTop: 7, color: COLORS.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  memberSheetScore: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  memberSheetStats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 5, padding: 9, borderRadius: 16, backgroundColor: '#F8F5FF' },
  memberSheetStat: { minWidth: '28%', flexGrow: 1, alignItems: 'center', paddingHorizontal: 4, paddingVertical: 5 },
  memberSheetStatValue: { color: COLORS.greenDark, fontSize: 18, fontWeight: '900' },
  memberSheetStatLabel: { marginTop: 2, color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.35, textAlign: 'center' },
  memberSheetHelp: { marginTop: 8, color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  memberSheetPrimary: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10, borderRadius: 16, backgroundColor: COLORS.purpleDark },
  memberSheetPrimaryText: { color: COLORS.white, fontSize: 15, fontWeight: '900' },
  memberSheetNotice: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10, padding: 13, borderRadius: 15, backgroundColor: COLORS.purplePale },
  memberSheetNoticeText: { flex: 1, color: COLORS.purpleDark, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  memberSheetBlock: { width: '100%', minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: '#F4C6D1', backgroundColor: '#FFF4F6' },
  memberSheetBlockText: { color: '#C94D69', fontSize: 13, fontWeight: '900' },
  memberSheetReport: { width: '100%', minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 2, borderRadius: 14 },
  memberSheetReportText: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
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
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  friendInfo: { flex: 1 },
  friendName: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  friendDetail: { marginTop: 2, color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  friendActions: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  accept: { color: COLORS.greenDark, fontSize: 13, fontWeight: '900' },
  subtleAction: { color: COLORS.muted, fontSize: 13, fontWeight: '800' },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  nudgeUnread: { backgroundColor: '#F6F3FF', borderColor: '#D6CBFF' },
  nudgeComposer: { gap: 10, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: '#DDD4FF', backgroundColor: '#F8F5FF' },
  nudgeComposerHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nudgeComposerIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#EAE4FF' },
  nudgeComposerHeadingCopy: { flex: 1 },
  nudgeComposerTitle: { color: COLORS.ink, fontSize: 16, fontWeight: '900' },
  nudgeComposerHelp: { marginTop: 1, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeComposerLabel: { marginTop: 3, color: COLORS.purpleDark, fontSize: 10, letterSpacing: 1, fontWeight: '900' },
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
  nudgeInboxGroup: { gap: 7 },
  nudgeInboxGroupTitle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  nudgeInboxGroupIcon: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  nudgeInboxGroupText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  nudgeText: { flex: 1 },
  nudgeTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  nudgeDetail: { marginTop: 3, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  nudgeInboxEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  nudgeInboxEmptyCopy: { flex: 1 },
  nudgeInboxEmptyTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' },
  nudgeInboxEmptyText: { marginTop: 2, color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.purple },
});
