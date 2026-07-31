import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, SOFT_SHADOW } from '../constants/theme';
import {
  type AdminDashboardData,
  type AdminFlashcardUsage,
  type AdminOpportunity,
  type AdminReportingRange,
  type AdminCollectionAdoption,
  type AdminUser,
  type AdminUserAction,
  type AdminUsageLeader,
  type AdminStatsSectionEngagement,
  type AdminCommunityInsights,
  fetchAdminDashboard,
  runAdminUserAction,
} from '../services';

const REPORTING_RANGES: Array<{ id: AdminReportingRange; label: string; shortLabel: string }> = [
  { id: 'today', label: 'Today', shortLabel: 'TODAY' },
  { id: '7d', label: '7 days', shortLabel: '7 DAYS' },
  { id: '30d', label: '30 days', shortLabel: '30 DAYS' },
  { id: 'all', label: 'All time', shortLabel: 'ALL TIME' },
];
const LEADERBOARD_PAGE_SIZE = 5;

const STATS_SECTION_LABELS: Record<string, string> = {
  practice_estimate: 'Practice estimate',
  mastery_progress: 'Word mastery',
  retrieval_path: 'Retrieval path',
  recall_feedback: 'Recall feedback',
  recall_pace: 'Recall pace',
  due_reviews: 'Due reviews',
  achievements: 'Achievements',
  question_mix: 'Question types',
  time_based_learning: 'Time-based learning',
  omega_history: 'Omega Test history',
  quiz_history: 'Quiz history',
};

export function AdminScreen({ onClose }: { onClose: () => void }) {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [reportingRange, setReportingRange] = useState<AdminReportingRange>('30d');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async (refreshing = false) => {
    refreshing ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      setDashboard(await fetchAdminDashboard(directoryPage, reportingRange));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load admin data.');
    } finally {
      refreshing ? setIsRefreshing(false) : setIsLoading(false);
    }
  }, [directoryPage, reportingRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return dashboard?.users ?? [];
    return (dashboard?.users ?? []).filter((user) =>
      [user.name, user.email].filter(Boolean).join(' ').toLowerCase().includes(normalized),
    );
  }, [dashboard?.users, query]);

  const leaderboardTotalPages = Math.max(
    1,
    Math.ceil((dashboard?.topLearners.length ?? 0) / LEADERBOARD_PAGE_SIZE),
  );
  const visibleLeaders = useMemo(() => {
    const start = (leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE;
    return (dashboard?.topLearners ?? []).slice(start, start + LEADERBOARD_PAGE_SIZE);
  }, [dashboard?.topLearners, leaderboardPage]);

  useEffect(() => {
    const totalPages = dashboard?.directory.totalPages ?? 1;
    if (directoryPage > totalPages) {
      setDirectoryPage(totalPages);
      setExpandedUserId(null);
    }
  }, [dashboard?.directory.totalPages, directoryPage]);

  useEffect(() => {
    if (leaderboardPage > leaderboardTotalPages) setLeaderboardPage(leaderboardTotalPages);
  }, [leaderboardPage, leaderboardTotalPages]);

  function changeDirectoryPage(nextPage: number) {
    const totalPages = dashboard?.directory.totalPages ?? 1;
    setExpandedUserId(null);
    setDirectoryPage(Math.max(1, Math.min(totalPages, nextPage)));
  }

  const reportingRangeLabel = REPORTING_RANGES.find(
    (range) => range.id === reportingRange,
  )?.shortLabel ?? '30 DAYS';

  function confirmAction(user: AdminUser, action: AdminUserAction) {
    const labels = {
      reset_free_tier: {
        title: 'Refresh free tier?',
        detail: `Reset ${displayName(user)}’s monthly word allowance to 0 of 10.`,
        confirm: 'Refresh',
        destructive: false,
      },
      grant_complimentary_access: {
        title: 'Give 30-day access?',
        detail: `Start a fresh 30-day complimentary WordWiz period for ${displayName(user)}.`,
        confirm: 'Give access',
        destructive: false,
      },
      delete_user: {
        title: 'Delete this user permanently?',
        detail: `${displayName(user)}’s account and all learning data will be permanently removed. This cannot be undone.`,
        confirm: 'Delete user',
        destructive: true,
      },
      community_disable_profile: {
        title: 'Hide this Community profile?',
        detail: `This removes ${displayName(user)} from Community rankings and turns off friend requests, nudges, and Community push delivery. Their learning data stays intact.`,
        confirm: 'Hide profile',
        destructive: true,
      },
      community_restore_profile: {
        title: 'Restore Community profile?',
        detail: `This makes ${displayName(user)} eligible for Community again. They will choose any public options again themselves.`,
        confirm: 'Restore',
        destructive: false,
      },
      community_resolve_reports: {
        title: 'Resolve Community reports?',
        detail: `Mark all open Community reports for ${displayName(user)} as resolved.`,
        confirm: 'Resolve',
        destructive: false,
      },
    }[action];
    Alert.alert(labels.title, labels.detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: labels.confirm,
        style: labels.destructive ? 'destructive' : 'default',
        onPress: () => { void performAction(user, action); },
      },
    ]);
  }

  async function performAction(user: AdminUser, action: AdminUserAction) {
    setBusyUserId(user.id);
    try {
      await runAdminUserAction(action, user.id);
      const message = action === 'delete_user'
        ? 'The account and its learning data were removed.'
        : action === 'reset_free_tier'
          ? 'Their monthly free-word counter was reset.'
          : action === 'grant_complimentary_access'
            ? 'A fresh 30-day complimentary period was granted.'
            : action === 'community_disable_profile'
              ? 'The Community profile is now hidden and Community actions are disabled.'
              : action === 'community_restore_profile'
                ? 'The Community profile is eligible again.'
                : 'Open reports for this Community profile were resolved.';
      Alert.alert('Updated', message);
      setExpandedUserId(null);
      await load(true);
    } catch (actionError) {
      Alert.alert(
        'Update not completed',
        actionError instanceof Error ? actionError.message : 'Please try again.',
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void load(true); }} tintColor={COLORS.purpleDark} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}><Ionicons name="shield-checkmark" size={23} color={COLORS.white} /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>PRIVATE OPERATIONS</Text>
            <Text style={styles.title}>Admin center</Text>
            <Text style={styles.subtitle}>Learner health, product signals, and account controls.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close admin center" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
            <Ionicons name="close" size={22} color={COLORS.purpleDark} />
          </Pressable>
        </View>

        <View style={styles.rangeCard}>
          <Text style={styles.rangeLabel}>REPORTING RANGE</Text>
          <View style={styles.rangeOptions}>
            {REPORTING_RANGES.map((range) => (
              <Pressable
                key={range.id}
                accessibilityRole="button"
                accessibilityState={{ selected: reportingRange === range.id }}
                onPress={() => {
                  setExpandedUserId(null);
                  setDirectoryPage(1);
                  setLeaderboardPage(1);
                  setReportingRange(range.id);
                }}
                style={({ pressed }) => [
                  styles.rangeOption,
                  reportingRange === range.id && styles.rangeOptionActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[
                  styles.rangeOptionText,
                  reportingRange === range.id && styles.rangeOptionTextActive,
                ]}>{range.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.purpleDark} /><Text style={styles.loadingText}>Loading secure workspace…</Text></View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={25} color={COLORS.red} />
            <View style={styles.errorCopy}><Text style={styles.errorTitle}>Admin data is unavailable</Text><Text style={styles.errorText}>{error}</Text></View>
            <Pressable onPress={() => { void load(); }} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable>
          </View>
        ) : dashboard ? (
          <>
            <View style={styles.metricsGrid}>
              <Metric icon="people-outline" label="TOTAL USERS" value={formatNumber(dashboard.metrics.totalUsers)} tone="purple" />
              <Metric icon="pulse-outline" label={`ACTIVE · ${reportingRangeLabel}`} value={formatNumber(dashboard.metrics.activeUsers7d)} tone="teal" />
              <Metric icon="person-add-outline" label={`NEW · ${reportingRangeLabel}`} value={formatNumber(dashboard.metrics.newUsers7d)} tone="blue" />
              <Metric icon="checkmark-circle-outline" label={`QUIZ ACCURACY · ${reportingRangeLabel}`} value={`${Math.round(dashboard.metrics.quizAccuracy30d)}%`} tone="orange" />
            </View>

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>PRODUCT SIGNALS</Text><Text style={styles.sectionTitle}>What to improve next</Text></View>
              <Text style={styles.generatedText}>Updated now</Text>
            </View>
            {dashboard.opportunities.length ? dashboard.opportunities.map((opportunity) => <Opportunity key={opportunity.id} opportunity={opportunity} />) : (
              <View style={styles.emptySignals}><Ionicons name="sparkles-outline" size={21} color={COLORS.teal} /><Text style={styles.emptySignalsText}>No obvious friction signals right now. Keep watching active learning and feedback.</Text></View>
            )}

            <View style={styles.overviewCard}>
              <MiniMetric label="WORDS SAVED" value={formatNumber(dashboard.metrics.savedWords)} />
              <MiniMetric label={`QUIZZES · ${reportingRangeLabel}`} value={formatNumber(dashboard.metrics.quizAttempts7d)} />
              <MiniMetric label={`REVIEWS · ${reportingRangeLabel}`} value={formatNumber(dashboard.metrics.cardReviews7d)} />
              <MiniMetric label="REMINDERS ON" value={formatNumber(dashboard.metrics.reminderUsers)} />
            </View>

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>COMMUNITY · {reportingRangeLabel}</Text><Text style={styles.sectionTitle}>Connection health</Text></View>
              <Text style={styles.generatedText}>Aggregate only</Text>
            </View>
            <CommunityInsightsCard insights={dashboard.community} rangeLabel={reportingRangeLabel} />
            {dashboard.community.topNudgers.length ? (
              <View style={styles.usageLeadersCard}>
                <Text style={styles.usageLeadersNote}>Most active nudge senders for this period. These are public Community display names only.</Text>
                {dashboard.community.topNudgers.map((sender, index) => (
                  <View key={sender.publicId} style={styles.usageLeaderRow}>
                    <View style={styles.usageLeaderRank}><Text style={styles.usageLeaderRankText}>{index + 1}</Text></View>
                    <View style={styles.usageLeaderCopy}><Text style={styles.usageLeaderName}>{sender.displayName}</Text><Text style={styles.usageLeaderDetail}>Community encouragement sent</Text></View>
                    <View style={styles.usageLeaderTotal}><Text style={styles.usageLeaderTotalValue}>{formatNumber(sender.nudges)}</Text><Text style={styles.usageLeaderTotalLabel}>NUDGES</Text></View>
                  </View>
                ))}
              </View>
            ) : null}
            {dashboard.community.topConnectors.length ? (
              <View style={styles.usageLeadersCard}>
                <Text style={styles.usageLeadersNote}>Most active Community interactions for this period. Connection counts are current; nudge counts use the selected range.</Text>
                {dashboard.community.topConnectors.map((connector, index) => <CommunityConnectorRow key={connector.publicId} connector={connector} rank={index + 1} />)}
              </View>
            ) : null}
            {dashboard.community.nudgeTemplates.length ? (
              <View style={styles.usageLeadersCard}>
                <Text style={styles.usageLeadersNote}>Most-used nudge types. This reports template selections only, never a message body.</Text>
                {dashboard.community.nudgeTemplates.map((template) => <NudgeTemplateRow key={template.messageKey} template={template} />)}
              </View>
            ) : null}
            {dashboard.community.reports.length ? (
              <View style={styles.reportCard}>
                <Text style={styles.timeGroupLabel}>OPEN COMMUNITY REPORTS</Text>
                {dashboard.community.reports.map((report) => <CommunityReportRow key={report.id} report={report} users={dashboard.users} onResolve={(user) => confirmAction(user, 'community_resolve_reports')} />)}
              </View>
            ) : <View style={styles.timeEmpty}><Ionicons name="shield-checkmark-outline" size={18} color={COLORS.teal} /><Text style={styles.timeEmptyText}>No open Community reports.</Text></View>}

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>TIME INSIGHTS · {reportingRangeLabel}</Text><Text style={styles.sectionTitle}>Where learners spend time</Text></View>
            </View>
            <View style={styles.learningTimeCard}>
              <View style={styles.learningTimeIcon}><Ionicons name="time-outline" size={21} color={COLORS.blue} /></View>
              <View style={styles.learningTimeCopy}><Text style={styles.learningTimeLabel}>COMPLETED LEARNING TIME</Text><Text style={styles.learningTimeValue}>{formatDuration(dashboard.timeInsights.completedLearningSeconds)}</Text><Text style={styles.learningTimeText}>Quiz and flashcard time from completed learning activity.</Text></View>
            </View>
            <FlashcardUsageCard usage={dashboard.flashcardUsage} rangeLabel={reportingRangeLabel} />
            <Text style={styles.timeGroupLabel}>TIME ON EACH PAGE · LONGEST FIRST</Text>
            {dashboard.timeInsights.screens.length ? dashboard.timeInsights.screens.map((insight) => (
              <TimeRow key={insight.id} label={insight.label} detail={`${formatNumber(insight.sessions)} sessions`} value={formatDuration(insight.seconds)} icon="phone-portrait-outline" color={COLORS.purpleDark} />
            )) : <View style={styles.timeEmpty}><Ionicons name="hourglass-outline" size={18} color={COLORS.muted} /><Text style={styles.timeEmptyText}>Screen time begins collecting after learners update to this version.</Text></View>}
            <Text style={styles.timeGroupLabel}>MOST-USED QUESTION FORMATS</Text>
            {dashboard.timeInsights.questionTypes.length ? [...dashboard.timeInsights.questionTypes].sort((first, second) => second.answers - first.answers || second.seconds - first.seconds).slice(0, 5).map((insight) => (
              <TimeRow key={insight.id} label={insight.label} detail={`${formatNumber(insight.answers)} answers · ${Math.round(insight.accuracy)}% correct`} value={formatDuration(insight.seconds)} icon="help-circle-outline" color={COLORS.orange} />
            )) : <View style={styles.timeEmpty}><Ionicons name="hourglass-outline" size={18} color={COLORS.muted} /><Text style={styles.timeEmptyText}>Question-format activity appears after completed quizzes with answer data.</Text></View>}
            <Text style={styles.timePrivacyNote}>Aggregate only: this view shows product patterns, not an individual learner’s browsing history.</Text>

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>STATS ENGAGEMENT · {reportingRangeLabel}</Text><Text style={styles.sectionTitle}>Most-opened Stats areas</Text></View>
              <Text style={styles.generatedText}>Aggregate opens</Text>
            </View>
            {dashboard.statsSectionEngagement.length ? dashboard.statsSectionEngagement.slice(0, 5).map((section) => (
              <StatsEngagementRow key={section.id} section={section} />
            )) : <View style={styles.timeEmpty}><Ionicons name="analytics-outline" size={18} color={COLORS.muted} /><Text style={styles.timeEmptyText}>Panel activity will appear after learners open Stats details in this version.</Text></View>}

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>LEARNING ACTIVITY · {reportingRangeLabel}</Text><Text style={styles.sectionTitle}>Most active learners</Text></View>
              <Text style={styles.generatedText}>Top 20</Text>
            </View>
            {dashboard.topLearners.length ? (
              <View style={styles.usageLeadersCard}>
                <Text style={styles.usageLeadersNote}>Ranked by words saved, completed quizzes, and flashcard reviews. Counts only—never learner content.</Text>
                {visibleLeaders.map((learner, index) => (
                  <UsageLeaderRow key={learner.userId} learner={learner} rank={(leaderboardPage - 1) * LEADERBOARD_PAGE_SIZE + index + 1} />
                ))}
                {leaderboardTotalPages > 1 ? (
                  <View style={styles.pagination}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous learner leaderboard page"
                      disabled={leaderboardPage === 1}
                      onPress={() => setLeaderboardPage((page) => Math.max(1, page - 1))}
                      style={({ pressed }) => [styles.pageButton, leaderboardPage === 1 && styles.pageButtonDisabled, pressed && styles.pressed]}
                    >
                      <Ionicons name="chevron-back" size={17} color={COLORS.purpleDark} />
                      <Text style={styles.pageButtonText}>Previous</Text>
                    </Pressable>
                    <Text style={styles.pageStatus}>Page {leaderboardPage} of {leaderboardTotalPages}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next learner leaderboard page"
                      disabled={leaderboardPage === leaderboardTotalPages}
                      onPress={() => setLeaderboardPage((page) => Math.min(leaderboardTotalPages, page + 1))}
                      style={({ pressed }) => [styles.pageButton, leaderboardPage === leaderboardTotalPages && styles.pageButtonDisabled, pressed && styles.pressed]}
                    >
                      <Text style={styles.pageButtonText}>Next</Text>
                      <Ionicons name="chevron-forward" size={17} color={COLORS.purpleDark} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.timeEmpty}><Ionicons name="bar-chart-outline" size={18} color={COLORS.muted} /><Text style={styles.timeEmptyText}>No learning activity has been recorded for this range yet.</Text></View>
            )}

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>CURATED COLLECTIONS</Text><Text style={styles.sectionTitle}>Most saved collections</Text></View>
              <Text style={styles.generatedText}>Live adoption</Text>
            </View>
            {dashboard.topCollections.length ? (
              <View style={styles.usageLeadersCard}>
                <Text style={styles.usageLeadersNote}>Collections currently saved in the most learner libraries. This is adoption, not a download-event count.</Text>
                {dashboard.topCollections.map((collection, index) => (
                  <CollectionAdoptionRow key={collection.collectionId} collection={collection} rank={index + 1} />
                ))}
              </View>
            ) : (
              <View style={styles.timeEmpty}><Ionicons name="library-outline" size={18} color={COLORS.muted} /><Text style={styles.timeEmptyText}>Collection adoption will appear after learners save curated sets.</Text></View>
            )}

            <View style={styles.sectionHeading}>
              <View><Text style={styles.sectionEyebrow}>USER CONTROLS</Text><Text style={styles.sectionTitle}>Recent user directory</Text></View>
              <Text style={styles.generatedText}>{dashboard.directory.totalUsers} users</Text>
            </View>
            <View style={styles.safetyNote}><Ionicons name="lock-closed-outline" size={16} color={COLORS.purpleDark} /><Text style={styles.safetyText}>Every action is recorded. Account deletion permanently removes learning data.</Text></View>
            <View style={styles.searchWrap}><Ionicons name="search-outline" size={19} color={COLORS.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Search this page" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} style={styles.searchInput} /></View>
            {filteredUsers.map((user) => (
              <UserCard key={user.id} user={user} isExpanded={expandedUserId === user.id} busy={busyUserId === user.id} onToggle={() => setExpandedUserId((current) => current === user.id ? null : user.id)} onAction={(action) => confirmAction(user, action)} />
            ))}
            {!filteredUsers.length ? <Text style={styles.noUsers}>No users match that search.</Text> : null}
            {dashboard.directory.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous user page"
                  disabled={directoryPage === 1}
                  onPress={() => changeDirectoryPage(directoryPage - 1)}
                  style={({ pressed }) => [styles.pageButton, directoryPage === 1 && styles.pageButtonDisabled, pressed && styles.pressed]}
                >
                  <Ionicons name="chevron-back" size={17} color={COLORS.purpleDark} />
                  <Text style={styles.pageButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.pageStatus}>Page {directoryPage} of {dashboard.directory.totalPages}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next user page"
                  disabled={directoryPage === dashboard.directory.totalPages}
                  onPress={() => changeDirectoryPage(directoryPage + 1)}
                  style={({ pressed }) => [styles.pageButton, directoryPage === dashboard.directory.totalPages && styles.pageButtonDisabled, pressed && styles.pressed]}
                >
                  <Text style={styles.pageButtonText}>Next</Text>
                  <Ionicons name="chevron-forward" size={17} color={COLORS.purpleDark} />
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: 'purple' | 'teal' | 'blue' | 'orange' }) {
  const colors = { purple: [COLORS.purplePale, COLORS.purpleDark], teal: [COLORS.tealPale, COLORS.teal], blue: [COLORS.bluePale, COLORS.blue], orange: [COLORS.orangePale, COLORS.orange] } as const;
  return <View style={[styles.metricCard, { backgroundColor: colors[tone][0] }]}><View style={[styles.metricIcon, { backgroundColor: `${colors[tone][1]}20` }]}><Ionicons name={icon} size={18} color={colors[tone][1]} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniMetric}><Text style={styles.miniMetricValue}>{value}</Text><Text style={styles.miniMetricLabel}>{label}</Text></View>;
}

function TimeRow({ label, detail, value, icon, color }: { label: string; detail: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string }) {
  return <View style={styles.timeRow}><View style={[styles.timeRowIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon} size={17} color={color} /></View><View style={styles.timeRowCopy}><Text style={styles.timeRowLabel}>{label}</Text><Text style={styles.timeRowDetail}>{detail}</Text></View><Text style={[styles.timeRowValue, { color }]}>{value}</Text></View>;
}

function FlashcardUsageCard({ usage, rangeLabel }: { usage: AdminFlashcardUsage; rangeLabel: string }) {
  return <View style={styles.flashcardUsageCard}>
    <View style={styles.flashcardUsageIcon}><Ionicons name="albums-outline" size={21} color={COLORS.teal} /></View>
    <View style={styles.flashcardUsageCopy}>
      <Text style={styles.flashcardUsageLabel}>FLASHCARD PRACTICE · {rangeLabel}</Text>
      <Text style={styles.flashcardUsageValue}>{formatNumber(usage.reviews)} reviews</Text>
      <Text style={styles.flashcardUsageText}>{formatNumber(usage.learners)} learners · {formatDuration(usage.seconds)} studying</Text>
    </View>
  </View>;
}

function CommunityInsightsCard({ insights, rangeLabel }: { insights: AdminCommunityInsights; rangeLabel: string }) {
  const nudgeReadRate = insights.nudgesSent ? Math.round((insights.nudgesRead / insights.nudgesSent) * 100) : 0;
  return <View style={styles.communityInsightsCard}>
    <View style={styles.communityHeroRow}><View style={styles.communityHeroIcon}><Ionicons name="people-outline" size={21} color={COLORS.purpleDark} /></View><View style={styles.communityHeroCopy}><Text style={styles.communityHeroLabel}>COMMUNITY MEMBERS</Text><Text style={styles.communityHeroValue}>{formatNumber(insights.profiles)}</Text><Text style={styles.communityHeroText}>{formatNumber(insights.leaderboardProfiles)} visible on optional rankings · {formatNumber(insights.acceptedFriendships)} active friend connections</Text></View></View>
    <View style={styles.communityMetricGrid}><MiniMetric label={`NUDGES · ${rangeLabel}`} value={formatNumber(insights.nudgesSent)} /><MiniMetric label="SENDERS" value={formatNumber(insights.nudgeSenders)} /><MiniMetric label="READ RATE" value={`${nudgeReadRate}%`} /><MiniMetric label="NEW REQUESTS" value={formatNumber(insights.friendRequestsSent)} /></View>
    <Text style={styles.communitySafetyText}>{formatNumber(insights.friendRequestsAccepted)} accepted · {formatNumber(insights.friendRequestsDeclined)} declined · {formatNumber(insights.unreadNudges)} unread · {formatNumber(insights.activePushTokens)} push devices · {formatNumber(insights.openReports)} open reports. No message bodies or private learning content are collected here.</Text>
  </View>;
}

function CommunityConnectorRow({ connector, rank }: { connector: AdminCommunityInsights['topConnectors'][number]; rank: number }) {
  const interactions = connector.nudgesSent + connector.nudgesReceived;
  return <View style={styles.usageLeaderRow}><View style={styles.usageLeaderRank}><Text style={styles.usageLeaderRankText}>{rank}</Text></View><View style={styles.usageLeaderCopy}><Text numberOfLines={1} style={styles.usageLeaderName}>{connector.displayName}</Text><Text style={styles.usageLeaderDetail}>{formatNumber(connector.connections)} connections · {formatNumber(connector.nudgesSent)} sent · {formatNumber(connector.nudgesReceived)} received</Text></View><View style={styles.usageLeaderTotal}><Text style={styles.usageLeaderTotalValue}>{formatNumber(interactions)}</Text><Text style={styles.usageLeaderTotalLabel}>INTERACTIONS</Text></View></View>;
}

function NudgeTemplateRow({ template }: { template: AdminCommunityInsights['nudgeTemplates'][number] }) {
  return <View style={styles.usageLeaderRow}><View style={styles.usageLeaderRank}><Ionicons name="sparkles-outline" size={14} color={COLORS.purpleDark} /></View><View style={styles.usageLeaderCopy}><Text numberOfLines={1} style={styles.usageLeaderName}>{formatNudgeTemplate(template.messageKey)}</Text><Text style={styles.usageLeaderDetail}>Selected encouragement template</Text></View><View style={styles.usageLeaderTotal}><Text style={styles.usageLeaderTotalValue}>{formatNumber(template.sends)}</Text><Text style={styles.usageLeaderTotalLabel}>SENT</Text></View></View>;
}

function CommunityReportRow({ report, users, onResolve }: { report: AdminCommunityInsights['reports'][number]; users: AdminUser[]; onResolve: (user: AdminUser) => void }) {
  const user = users.find((candidate) => candidate.id === report.reportedUserId);
  return <View style={styles.reportRow}><View style={styles.reportIcon}><Ionicons name="flag-outline" size={16} color={COLORS.orange} /></View><View style={styles.reportCopy}><Text style={styles.reportName}>{report.displayName}</Text><Text style={styles.reportDetail}>{report.reason.replaceAll('_', ' ')} · {relativeDate(report.createdAt)}</Text></View>{user ? <Pressable onPress={() => onResolve(user)} style={styles.resolveButton}><Text style={styles.resolveText}>Resolve</Text></Pressable> : <Text style={styles.reportDetail}>Review</Text>}</View>;
}

function StatsEngagementRow({ section }: { section: AdminStatsSectionEngagement }) {
  return <TimeRow
    label={STATS_SECTION_LABELS[section.id] ?? section.id}
    detail="panel opens"
    value={formatNumber(section.interactions)}
    icon="pulse-outline"
    color={COLORS.teal}
  />;
}

function UsageLeaderRow({ learner, rank }: { learner: AdminUsageLeader; rank: number }) {
  const name = learner.name?.trim() || learner.email || 'Learner';
  return <View style={styles.usageLeaderRow}>
    <View style={styles.usageLeaderRank}><Text style={styles.usageLeaderRankText}>{rank}</Text></View>
    <View style={styles.usageLeaderCopy}>
      <Text numberOfLines={1} style={styles.usageLeaderName}>{name}</Text>
      <Text style={styles.usageLeaderDetail}>{learner.wordsSaved} words · {learner.quizCount} quizzes · {learner.cardReviewCount} reviews</Text>
    </View>
    <View style={styles.usageLeaderTotal}><Text style={styles.usageLeaderTotalValue}>{formatNumber(learner.learningActions)}</Text><Text style={styles.usageLeaderTotalLabel}>ACTIONS</Text></View>
  </View>;
}

function CollectionAdoptionRow({ collection, rank }: { collection: AdminCollectionAdoption; rank: number }) {
  return <View style={styles.usageLeaderRow}>
    <View style={styles.usageLeaderRank}><Text style={styles.usageLeaderRankText}>{rank}</Text></View>
    <View style={styles.usageLeaderCopy}>
      <Text numberOfLines={1} style={styles.usageLeaderName}>{collection.name}</Text>
      <Text style={styles.usageLeaderDetail}>{formatNumber(collection.memberWordCount)} collection words currently saved</Text>
    </View>
    <View style={styles.usageLeaderTotal}><Text style={styles.usageLeaderTotalValue}>{formatNumber(collection.learnerCount)}</Text><Text style={styles.usageLeaderTotalLabel}>LEARNERS</Text></View>
  </View>;
}

function Opportunity({ opportunity }: { opportunity: AdminOpportunity }) {
  const tone = { purple: [COLORS.purplePale, COLORS.purpleDark, 'flag-outline'], blue: [COLORS.bluePale, COLORS.blue, 'rocket-outline'], orange: [COLORS.orangePale, COLORS.orange, 'flash-outline'], red: [COLORS.redPale, COLORS.red, 'heart-outline'] } as const;
  const [backgroundColor, color, icon] = tone[opportunity.tone];
  return <View style={[styles.opportunity, { backgroundColor }]}><View style={[styles.opportunityIcon, { backgroundColor: `${color}22` }]}><Ionicons name={icon} size={20} color={color} /></View><View style={styles.opportunityCopy}><Text style={styles.opportunityTitle}>{opportunity.title}</Text><Text style={styles.opportunityText}>{opportunity.detail}</Text></View><Text style={[styles.opportunityMetric, { color }]}>{formatNumber(opportunity.metric)}</Text></View>;
}

function UserCard({ user, isExpanded, busy, onToggle, onAction }: { user: AdminUser; isExpanded: boolean; busy: boolean; onToggle: () => void; onAction: (action: AdminUserAction) => void }) {
  const accessColor = user.access === 'plus' ? COLORS.teal : user.access === 'complimentary' ? COLORS.purpleDark : COLORS.muted;
  return <View style={[styles.userCard, isExpanded && styles.userCardExpanded]}>
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.userTop, pressed && styles.pressed]}>
      <View style={styles.userAvatar}><Text style={styles.userAvatarText}>{displayName(user).charAt(0).toUpperCase()}</Text></View>
      <View style={styles.userCopy}><Text style={styles.userName} numberOfLines={1}>{displayName(user)}</Text><Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text><Text style={styles.userActivity}>{user.lastActiveAt ? `Last active ${relativeDate(user.lastActiveAt)}` : 'No learning activity yet'}</Text></View>
      <View style={styles.userStatus}><Text style={[styles.accessPill, { color: accessColor, borderColor: `${accessColor}55` }]}>{user.access === 'plus' ? 'PLUS' : user.access === 'complimentary' ? '30-DAY ACCESS' : 'FREE'}</Text><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={COLORS.muted} /></View>
    </Pressable>
    {isExpanded ? <View style={styles.userControls}>
      <View style={styles.userStats}><Text style={styles.userStat}>{user.wordCount} words</Text><Text style={styles.userStat}>{user.quizCount} quizzes</Text><Text style={styles.userStat}>{user.cardReviewCount} reviews</Text><Text style={styles.userStat}>{user.freeWordsAdded}/{user.freeWordLimit} free this month</Text></View>
      <View style={styles.controlRow}>
        <Control label="Reset free" icon="refresh-outline" disabled={busy} onPress={() => onAction('reset_free_tier')} />
        <Control label="Give 30d" icon="gift-outline" disabled={busy} onPress={() => onAction('grant_complimentary_access')} />
        <Control label="Delete" icon="trash-outline" danger disabled={busy} onPress={() => onAction('delete_user')} />
      </View>
      {user.communityEligible !== null ? <View style={styles.communityControlRow}><Text style={styles.communityStatus}>{user.communityEligible ? 'Community access available' : 'Community access restricted'}</Text><Control label={user.communityEligible ? 'Restrict community' : 'Lift restriction'} icon={user.communityEligible ? 'eye-off-outline' : 'eye-outline'} danger={user.communityEligible} disabled={busy} onPress={() => onAction(user.communityEligible ? 'community_disable_profile' : 'community_restore_profile')} /></View> : null}
      {busy ? <View style={styles.busyLine}><ActivityIndicator size="small" color={COLORS.purpleDark} /><Text style={styles.busyText}>Applying secure update…</Text></View> : null}
    </View> : null}
  </View>;
}

function Control({ label, icon, danger = false, disabled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; danger?: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.control, danger && styles.controlDanger, (pressed || disabled) && styles.pressed]}><Ionicons name={icon} size={15} color={danger ? COLORS.red : COLORS.purpleDark} /><Text style={[styles.controlText, danger && styles.controlDangerText]}>{label}</Text></Pressable>;
}

function displayName(user: AdminUser) { return user.name?.trim() || user.email.split('@')[0] || 'Learner'; }
function relativeDate(value: string) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`; }
function formatNumber(value: number) { return new Intl.NumberFormat().format(Number(value) || 0); }
function formatDuration(value: number) { const seconds = Math.max(0, Number(value) || 0); if (seconds < 60) return seconds ? '<1m' : '0m'; const minutes = Math.round(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
function formatNudgeTemplate(value: string) { return value.split('_').filter(Boolean).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(' ') || 'Nudge'; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background }, content: { padding: 18, paddingBottom: 44 }, pressed: { opacity: 0.78 },
  header: { minHeight: 136, borderRadius: 25, padding: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#E6E0FF', ...SOFT_SHADOW }, headerIcon: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purpleDark }, headerCopy: { flex: 1 }, eyebrow: { color: COLORS.purpleDark, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, title: { marginTop: 2, color: COLORS.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 }, subtitle: { marginTop: 5, color: COLORS.muted, fontSize: 12, fontWeight: '700', lineHeight: 17 }, closeButton: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  rangeCard: { marginTop: 12, padding: 5, borderRadius: 16, backgroundColor: COLORS.white, ...SOFT_SHADOW }, rangeLabel: { marginLeft: 7, marginTop: 2, color: COLORS.muted, fontSize: 7, letterSpacing: 0.7, fontWeight: '900' }, rangeOptions: { marginTop: 4, flexDirection: 'row', gap: 3 }, rangeOption: { flex: 1, minHeight: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, rangeOptionActive: { backgroundColor: COLORS.purplePale }, rangeOptionText: { color: COLORS.muted, fontSize: 8, fontWeight: '900' }, rangeOptionTextActive: { color: COLORS.purpleDark },
  loading: { paddingVertical: 72, alignItems: 'center', gap: 12 }, loadingText: { color: COLORS.muted, fontWeight: '700' }, errorCard: { marginTop: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, backgroundColor: COLORS.redPale }, errorCopy: { flex: 1 }, errorTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900' }, errorText: { marginTop: 3, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700' }, retryButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.white }, retryText: { color: COLORS.red, fontSize: 11, fontWeight: '900' },
  metricsGrid: { marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metricCard: { width: '48.5%', minHeight: 117, padding: 13, borderRadius: 18 }, metricIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, metricValue: { marginTop: 13, color: COLORS.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 }, metricLabel: { marginTop: 3, color: COLORS.muted, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.5 },
  sectionHeading: { marginTop: 27, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, sectionEyebrow: { color: COLORS.purpleDark, fontSize: 9, letterSpacing: 1, fontWeight: '900' }, sectionTitle: { marginTop: 3, color: COLORS.ink, fontSize: 19, fontWeight: '900', letterSpacing: -0.25 }, generatedText: { color: COLORS.muted, fontSize: 10, fontWeight: '800' },
  opportunity: { minHeight: 79, marginBottom: 9, padding: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }, opportunityIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, opportunityCopy: { flex: 1 }, opportunityTitle: { color: COLORS.ink, fontSize: 12, lineHeight: 16, fontWeight: '900' }, opportunityText: { marginTop: 2, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' }, opportunityMetric: { minWidth: 25, textAlign: 'right', fontSize: 20, fontWeight: '900' }, emptySignals: { padding: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.tealPale }, emptySignalsText: { flex: 1, color: COLORS.muted, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  overviewCard: { marginTop: 8, paddingVertical: 14, borderRadius: 18, flexDirection: 'row', backgroundColor: COLORS.white, ...SOFT_SHADOW }, miniMetric: { flex: 1, alignItems: 'center', paddingHorizontal: 4 }, miniMetricValue: { color: COLORS.ink, fontSize: 16, fontWeight: '900' }, miniMetricLabel: { marginTop: 4, color: COLORS.muted, textAlign: 'center', fontSize: 7, lineHeight: 9, letterSpacing: 0.4, fontWeight: '900' },
  learningTimeCard: { padding: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.bluePale }, learningTimeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }, learningTimeCopy: { flex: 1 }, learningTimeLabel: { color: COLORS.blue, fontSize: 9, letterSpacing: 0.8, fontWeight: '900' }, learningTimeValue: { marginTop: 1, color: COLORS.ink, fontSize: 23, letterSpacing: -0.4, fontWeight: '900' }, learningTimeText: { marginTop: 2, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' }, timeGroupLabel: { marginTop: 16, marginBottom: 7, color: COLORS.muted, fontSize: 9, letterSpacing: 0.8, fontWeight: '900' }, timeRow: { minHeight: 58, marginBottom: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.white }, timeRowIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, timeRowCopy: { flex: 1 }, timeRowLabel: { color: COLORS.ink, fontSize: 12, fontWeight: '900' }, timeRowDetail: { marginTop: 2, color: COLORS.muted, fontSize: 9, fontWeight: '700' }, timeRowValue: { fontSize: 14, fontWeight: '900' }, timeEmpty: { padding: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white }, timeEmptyText: { flex: 1, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' }, timePrivacyNote: { marginTop: 10, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontStyle: 'italic', fontWeight: '700' },
  flashcardUsageCard: { marginTop: 9, padding: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: COLORS.tealPale }, flashcardUsageIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }, flashcardUsageCopy: { flex: 1 }, flashcardUsageLabel: { color: COLORS.teal, fontSize: 9, letterSpacing: 0.8, fontWeight: '900' }, flashcardUsageValue: { marginTop: 1, color: COLORS.ink, fontSize: 20, letterSpacing: -0.3, fontWeight: '900' }, flashcardUsageText: { marginTop: 2, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  communityInsightsCard: { padding: 14, borderRadius: 18, backgroundColor: COLORS.purplePale, borderWidth: 1, borderColor: '#D9D0FF' }, communityHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, communityHeroIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }, communityHeroCopy: { flex: 1 }, communityHeroLabel: { color: COLORS.purpleDark, fontSize: 9, letterSpacing: 0.8, fontWeight: '900' }, communityHeroValue: { marginTop: 1, color: COLORS.ink, fontSize: 23, letterSpacing: -0.4, fontWeight: '900' }, communityHeroText: { marginTop: 2, color: COLORS.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' }, communityMetricGrid: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#DED7F5', flexDirection: 'row' }, communitySafetyText: { marginTop: 12, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' }, reportCard: { marginTop: 9, padding: 12, borderRadius: 18, backgroundColor: COLORS.white, ...SOFT_SHADOW }, reportRow: { minHeight: 54, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 9 }, reportIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.orangePale }, reportCopy: { flex: 1 }, reportName: { color: COLORS.ink, fontSize: 12, fontWeight: '900' }, reportDetail: { marginTop: 2, color: COLORS.muted, fontSize: 9, fontWeight: '700', textTransform: 'capitalize' }, resolveButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: COLORS.tealPale }, resolveText: { color: COLORS.greenDark, fontSize: 9, fontWeight: '900' },
  usageLeadersCard: { padding: 12, borderRadius: 18, backgroundColor: COLORS.white, ...SOFT_SHADOW }, usageLeadersNote: { marginBottom: 8, color: COLORS.muted, fontSize: 9, lineHeight: 13, fontWeight: '700' }, usageLeaderRow: { minHeight: 60, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 9 }, usageLeaderRank: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purplePale }, usageLeaderRankText: { color: COLORS.purpleDark, fontSize: 11, fontWeight: '900' }, usageLeaderCopy: { flex: 1 }, usageLeaderName: { color: COLORS.ink, fontSize: 12, fontWeight: '900' }, usageLeaderDetail: { marginTop: 2, color: COLORS.muted, fontSize: 9, fontWeight: '700' }, usageLeaderTotal: { minWidth: 46, alignItems: 'flex-end' }, usageLeaderTotalValue: { color: COLORS.teal, fontSize: 16, fontWeight: '900' }, usageLeaderTotalLabel: { marginTop: 1, color: COLORS.muted, fontSize: 7, letterSpacing: 0.5, fontWeight: '900' },
  safetyNote: { padding: 12, borderRadius: 14, flexDirection: 'row', gap: 8, backgroundColor: COLORS.purplePale }, safetyText: { flex: 1, color: COLORS.purpleDark, fontSize: 10, lineHeight: 14, fontWeight: '800' }, searchWrap: { height: 48, marginTop: 11, marginBottom: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: COLORS.border, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.white }, searchInput: { flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  userCard: { marginBottom: 9, borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, backgroundColor: COLORS.white, overflow: 'hidden' }, userCardExpanded: { borderColor: '#D9D0FF' }, userTop: { minHeight: 76, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, userAvatar: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bluePale }, userAvatarText: { color: COLORS.blue, fontSize: 15, fontWeight: '900' }, userCopy: { flex: 1 }, userName: { color: COLORS.ink, fontSize: 13, fontWeight: '900' }, userEmail: { marginTop: 1, color: COLORS.muted, fontSize: 10, fontWeight: '700' }, userActivity: { marginTop: 4, color: COLORS.muted, fontSize: 9, fontWeight: '700' }, userStatus: { alignItems: 'flex-end', gap: 5 }, accessPill: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, borderWidth: 1, overflow: 'hidden', fontSize: 7, fontWeight: '900', letterSpacing: 0.35 }, userControls: { padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: COLORS.border }, userStats: { paddingVertical: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, userStat: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, color: COLORS.muted, backgroundColor: COLORS.background, fontSize: 9, fontWeight: '800' }, controlRow: { flexDirection: 'row', gap: 7 }, communityControlRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, communityStatus: { flex: 1, color: COLORS.muted, fontSize: 9, fontWeight: '800' }, control: { flex: 1, minHeight: 36, borderWidth: 1, borderColor: '#DCD4FF', borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: COLORS.purplePale }, controlDanger: { borderColor: '#FFC8D6', backgroundColor: COLORS.redPale }, controlText: { color: COLORS.purpleDark, fontSize: 9, fontWeight: '900' }, controlDangerText: { color: COLORS.red }, busyLine: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, busyText: { color: COLORS.purpleDark, fontSize: 10, fontWeight: '800' }, noUsers: { paddingVertical: 25, textAlign: 'center', color: COLORS.muted, fontSize: 12, fontWeight: '700' }, pagination: { marginTop: 8, marginBottom: 4, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, pageButton: { minHeight: 38, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DCD4FF', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.purplePale }, pageButtonDisabled: { opacity: 0.4 }, pageButtonText: { color: COLORS.purpleDark, fontSize: 9, fontWeight: '900' }, pageStatus: { flex: 1, color: COLORS.muted, fontSize: 9, textAlign: 'center', fontWeight: '800' },
});
