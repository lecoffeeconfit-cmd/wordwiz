import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizProgress, QuizQuestion, ReminderSettings, SortMode, Word } from '../types';
import { styles } from '../styles';
import { buildQuiz, calculateStreakStats, formatReminderTime, formatStudyTime, getDayKey, getRecentDays, getStreakMessage, getStreakWeek, getWordMastery, shuffle } from '../utils';
import { DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';

export function WordsScreen({
  words,
  sortMode,
  onChangeSort,
  onAdd,
  onRemove,
  onStudy,
}: {
  words: Word[];
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  onAdd: () => void;
  onRemove: (word: Word) => void;
  onStudy: () => void;
}) {
  return (
    <View style={styles.screen}>
      <FlatList
        data={words}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ScreenHeader
              eyebrow="MY COLLECTION"
              title="Words worth knowing"
              subtitle="Save new discoveries and make them yours."
            />

            <View style={styles.progressCard}>
              <View style={styles.progressIcon}>
                <Ionicons name="book" size={25} color={COLORS.purpleDark} />
              </View>
              <View style={styles.progressCopy}>
                <Text style={styles.progressNumber}>{words.length} words</Text>
                <Text style={styles.progressLabel}>
                  {words.length === 0
                    ? 'Your collection is ready to grow'
                    : 'Your vocabulary is growing!'}
                </Text>
              </View>
              {words.length > 0 && (
                <Pressable onPress={onStudy} style={styles.studyButton}>
                  <Ionicons name="play" size={15} color={COLORS.white} />
                  <Text style={styles.studyButtonText}>STUDY</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={onAdd} style={styles.addButton}>
              <View style={styles.addIcon}>
                <Ionicons name="add" size={25} color={COLORS.white} />
              </View>
              <View style={styles.addButtonCopy}>
                <Text style={styles.addButtonTitle}>Add a new word</Text>
                <Text style={styles.addButtonSubtitle}>
                  What did you discover today?
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={23} color={COLORS.white} />
            </Pressable>

            <View style={styles.listToolbar}>
              <Text style={styles.sectionTitle}>YOUR WORDS</Text>
              <View style={styles.segmentedControl}>
                <SortButton
                  active={sortMode === 'alphabetical'}
                  icon="text"
                  onPress={() => onChangeSort('alphabetical')}
                />
                <SortButton
                  active={sortMode === 'recent'}
                  icon="time"
                  onPress={() => onChangeSort('recent')}
                />
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="leaf-outline" size={38} color={COLORS.green} />
            </View>
            <Text style={styles.emptyTitle}>Start your collection</Text>
            <Text style={styles.emptyText}>
              Add a word you heard, read, or wondered about.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <WordRow word={item} index={index} onRemove={onRemove} />
        )}
      />
    </View>
  );
}
