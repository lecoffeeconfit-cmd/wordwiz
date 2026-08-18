import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { styles } from '../styles';

function Guideline({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.legalSection}>
      <Text style={styles.legalSectionTitle}>{title}</Text>
      <Text style={styles.legalBodyText}>{body}</Text>
    </View>
  );
}

export function CommunityGuidelinesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.legalSafeArea}>
        <ScrollView contentContainerStyle={styles.legalModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.modalTopRow}>
            <Pressable onPress={onClose} accessibilityLabel="Close Community Guidelines" style={styles.closeButton}>
              <Ionicons name="close" size={23} color={COLORS.ink} />
            </Pressable>
            <View style={styles.modalStep}>
              <Ionicons name="people-outline" size={15} color={COLORS.teal} />
              <Text style={styles.modalStepText}>CONNECT</Text>
            </View>
            <View style={styles.closeButtonPlaceholder} />
          </View>

          <View style={styles.legalHero}>
            <View style={styles.legalHeroIcon}>
              <Ionicons name="heart-outline" size={30} color={COLORS.blue} />
            </View>
            <Text style={styles.legalTitle}>Community Guidelines</Text>
            <Text style={styles.legalSubtitle}>A welcoming space to learn, connect, and encourage each other.</Text>
          </View>

          <Guideline title="Be kind and respectful" body="Use a friendly display name and treat every learner with respect. Harassment, threats, hate, bullying, sexual content, spam, and impersonation are not allowed." />
          <Guideline title="Keep profile photos appropriate" body="Use a safe, suitable photo. Do not use graphic, sexual, hateful, illegal, deceptive, or offensive images. New profile photos are screened before appearing in Connect." />
          <Guideline title="Protect privacy" body="Only connect with people you know. Do not share personal contact details or use Connect to collect personal information. You can keep your profile private at any time." />
          <Guideline title="Report or block when needed" body="Open a learner’s Connect profile to report a concern or block them. Blocking stops new friend requests and nudges between you. Reports help WordWiz review possible violations." />
          <Guideline title="What WordWiz may do" body="We may remove a profile photo, hide a profile from Community, restrict Community features, or take further action for serious or repeated violations. Your core learning data is kept separate from Community controls." />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
