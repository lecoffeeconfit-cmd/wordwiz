import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import type { LegalPage, WordDetails } from '../types';
import { styles } from '../styles';
import { lookupWordDetails } from '../services';
import { InfoChip } from '../components';
import { inferOriginPeriod } from '../utils';

export function LegalModal({
  page,
  onClose,
}: {
  page: LegalPage | null;
  onClose: () => void;
}) {
  const isTerms = page === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const subtitle = isTerms
    ? 'The simple rules for using WordWiz.'
    : 'How WordWiz handles your learning information.';

  return (
    <Modal visible={page !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.legalSafeArea}>
        <ScrollView
          contentContainerStyle={styles.legalModalContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.modalTopRow}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={23} color={COLORS.ink} />
            </Pressable>
            <View style={styles.modalStep}>
              <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.teal} />
              <Text style={styles.modalStepText}>LEGAL</Text>
            </View>
            <View style={styles.closeButtonPlaceholder} />
          </View>

          <View style={styles.legalHero}>
            <View style={styles.legalHeroIcon}>
              <Ionicons
                name={isTerms ? 'document-text-outline' : 'lock-closed-outline'}
                size={30}
                color={COLORS.blue}
              />
            </View>
            <Text style={styles.legalTitle}>{title}</Text>
            <Text style={styles.legalSubtitle}>{subtitle}</Text>
            <Text style={styles.legalDate}>Last updated June 19, 2026</Text>
          </View>

          {isTerms ? <TermsContent /> : <PrivacyContent />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.legalSection}>
      <Text style={styles.legalSectionTitle}>{title}</Text>
      <Text style={styles.legalBodyText}>{children}</Text>
    </View>
  );
}

function TermsContent() {
  return (
    <>
      <LegalSection title="Using WordWiz">
        WordWiz is a learning tool for saving words, reviewing flashcards, taking quizzes, and tracking study progress. Use it in a respectful, lawful way and only add content you have the right to use.
      </LegalSection>
      <LegalSection title="Learning information">
        Definitions, examples, word history, mastery scores, and quiz feedback are for study support. They may be incomplete or imperfect, so check an authoritative source for school, work, medical, legal, or other important decisions.
      </LegalSection>
      <LegalSection title="Dictionary lookups">
        When you use automatic definitions, the word you type may be sent to a dictionary service so WordWiz can retrieve basic word information. If a lookup is unavailable, you can still type your own definition.
      </LegalSection>
      <LegalSection title="No guarantees">
        WordWiz is provided as-is. The app may change, contain mistakes, or be unavailable at times. Your use of the app is your responsibility.
      </LegalSection>
      <LegalSection title="Changes">
        These terms may be updated as the app changes. Continued use of WordWiz after updates means you accept the updated terms.
      </LegalSection>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <LegalSection title="What WordWiz saves">
        WordWiz saves your words, definitions, examples, quiz history, flashcard reviews, streaks, and reminder settings on your device so the app can show your progress.
      </LegalSection>
      <LegalSection title="Where data is stored">
        Learning data is stored locally using app storage. WordWiz does not include accounts, social sharing, or a custom server for your saved word list in this version.
      </LegalSection>
      <LegalSection title="Automatic definitions">
        If you ask WordWiz to automatically define a word, that word is sent to an external dictionary API to fetch definitions, examples, pronunciation, synonyms, and origin information when available.
      </LegalSection>
      <LegalSection title="Notifications">
        If you turn on daily reminders, your device may store a scheduled notification time. You can turn reminders off from the dashboard.
      </LegalSection>
      <LegalSection title="Your choices">
        You can delete individual words from the word list and turn off reminders. Removing the app or clearing app storage may remove saved learning data from your device.
      </LegalSection>
    </>
  );
}
