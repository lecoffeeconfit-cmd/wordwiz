import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import type { LegalPage } from '../types';
import { styles } from '../styles';

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
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.legalSection}>
      <Text style={styles.legalSectionTitle}>{title}</Text>
      <Text style={styles.legalBodyText}>{body}</Text>
    </View>
  );
}

function TermsContent() {
  return (
    <>
      <LegalSection
        title="Using WordWiz"
        body="WordWiz is a learning tool for saving words, reviewing flashcards, taking quizzes, and tracking study progress. Use it in a respectful, lawful way and only add content you have the right to use."
      />
      <LegalSection
        title="Learning information"
        body="Definitions, examples, word history, mastery scores, and quiz feedback are for study support. They may be incomplete or imperfect, so check an authoritative source for school, work, medical, legal, or other important decisions."
      />
      <LegalSection
        title="Dictionary lookups"
        body="When you use automatic definitions, the word you type may be sent to dictionary and word-history services so WordWiz can retrieve definitions, examples, pronunciation, synonyms, and origin information when available. If a lookup is unavailable, you can still type your own definition."
      />
      <LegalSection
        title="No guarantees"
        body="WordWiz is provided as-is. The app may change, contain mistakes, or be unavailable at times. Your use of the app is your responsibility."
      />
      <LegalSection
        title="Changes"
        body="These terms may be updated as the app changes. Continued use of WordWiz after updates means you accept the updated terms."
      />
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <LegalSection
        title="What WordWiz saves"
        body="WordWiz saves your words, definitions, examples, quiz history, flashcard reviews, streaks, and reminder settings so the app can show your progress."
      />
      <LegalSection
        title="Where data is stored"
        body="Learning data may be stored on your device and synced to Supabase when you are signed in. Supabase Auth stores account information such as your email address and profile name."
      />
      <LegalSection
        title="Automatic definitions"
        body="If you ask WordWiz to automatically define a word, that word is sent to external dictionary and word-history services to fetch definitions, examples, pronunciation, synonyms, and origin information when available."
      />
      <LegalSection
        title="Notifications"
        body="If you turn on daily reminders, your device may store a scheduled notification time. You can turn reminders off from the dashboard."
      />
      <LegalSection
        title="Your choices"
        body="You can delete individual words from the word list, turn off reminders, and request account deletion. Removing the app or clearing app storage may remove saved learning data from your device."
      />
    </>
  );
}
