import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { COLORS } from '../constants/theme';
import { styles } from '../styles';
import type { LegalPage } from '../types';
import { useSubscription } from '../subscription/SubscriptionProvider';

type PaywallReason = 'quiz' | 'word-limit' | 'premium-feature';

export function WordWizPlusModal({
  visible,
  reason = 'premium-feature',
  onClose,
  onPlusActivated,
  onOpenLegal,
}: {
  visible: boolean;
  reason?: PaywallReason;
  onClose: () => void;
  onPlusActivated: () => void;
  onOpenLegal: (page: LegalPage) => void;
}) {
  const subscription = useSubscription();
  const [selectedPackage, setSelectedPackage] = useState<'annual' | 'monthly'>('annual');
  const [trialEligible, setTrialEligible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = selectedPackage === 'annual' && subscription.annualPackage
    ? subscription.annualPackage
    : subscription.monthlyPackage ?? subscription.annualPackage;
  const hasPurchasablePlan = Boolean(subscription.monthlyPackage || subscription.annualPackage);
  const annualSelected = selected?.identifier === subscription.annualPackage?.identifier;
  const monthlySelected = selected?.identifier === subscription.monthlyPackage?.identifier;
  const annualSavingsPercent = useMemo(() => getAnnualSavingsPercent(
    subscription.monthlyPackage,
    subscription.annualPackage,
  ), [subscription.annualPackage, subscription.monthlyPackage]);

  useEffect(() => {
    if (!visible) return;
    setMessage(null);
    void subscription.isEligibleForTrial().then(setTrialEligible);
  }, [subscription, visible]);

  async function purchase() {
    if (!selected) {
      setMessage('Plans are still loading. Please try again in a moment.');
      return;
    }

    const result = await subscription.purchase(selected);
    if (result.status === 'success') {
      onPlusActivated();
      return;
    }
    if (result.status === 'failed') setMessage(result.message);
  }

  async function restore() {
    const result = await subscription.restore();
    if (result.status === 'restored') {
      Alert.alert('WordWiz Plus restored', 'Your Plus learning tools are ready.');
      onPlusActivated();
      return;
    }
    if (result.status === 'not-found') {
      Alert.alert('No active subscription found', 'We could not find an active WordWiz Plus subscription for this Apple ID.');
      return;
    }
    setMessage(result.message);
  }

  async function manage() {
    try {
      await subscription.manageSubscription();
    } catch {
      setMessage('Apple subscription settings are unavailable right now. Please try again shortly.');
    }
  }

  const reasonCopy = reason === 'word-limit'
    ? 'You’ve used this month’s 10 free word additions. Your allowance resets next calendar month, or Plus keeps your vocabulary growing without a monthly cap.'
    : reason === 'quiz'
      ? 'Quizzes, adaptive learning modes, and detailed progress insights are part of WordWiz Plus.'
      : 'Unlock WordWiz’s complete adaptive learning experience.';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.plusModalScreen}>
        <ScrollView contentContainerStyle={styles.plusModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.plusModalTopRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close WordWiz Plus" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={23} color={COLORS.ink} />
            </Pressable>
            <View style={styles.plusBadge}>
              <Ionicons name="sparkles" size={14} color={COLORS.purpleDark} />
              <Text style={styles.plusBadgeText}>WORDWIZ PLUS</Text>
            </View>
            <View style={styles.closeButtonPlaceholder} />
          </View>

          <View style={styles.plusHero}>
            <View style={styles.plusHeroIcon}>
              <Ionicons name="sparkles" size={30} color={COLORS.purpleDark} />
            </View>
            <Text style={styles.plusTitle}>Learn words that last</Text>
            <Text style={styles.plusSubtitle}>{reasonCopy}</Text>
          </View>

          <View style={styles.plusBenefits}>
            <Benefit icon="infinite-outline" text="Unlimited new word additions" />
            <Benefit icon="trophy-outline" text="All quiz types and learning modes" />
            <Benefit icon="analytics-outline" text="Mastery, retention, and recall insights" />
          </View>

          {subscription.isLoading ? (
            <View style={styles.plusLoadingCard}>
              <ActivityIndicator color={COLORS.purpleDark} />
              <Text style={styles.plusLoadingText}>Loading your Apple plans…</Text>
            </View>
          ) : subscription.isSupported ? (
            <>
              {hasPurchasablePlan ? <>
                <PlanOption
                  title="Annual"
                  caption={subscription.annualPackage?.product.pricePerMonthString
                    ? `${subscription.annualPackage.product.pricePerMonthString} per month, billed yearly`
                    : 'Billed yearly'}
                  price={subscription.annualPackage?.product.priceString ?? 'Unavailable'}
                  selected={annualSelected}
                  disabled={!subscription.annualPackage}
                  badge={annualSavingsPercent ? `SAVE ${annualSavingsPercent}%` : undefined}
                  onPress={() => setSelectedPackage('annual')}
                />
                <PlanOption
                  title="Monthly"
                  caption="Billed monthly"
                  price={subscription.monthlyPackage?.product.priceString ?? 'Unavailable'}
                  selected={monthlySelected}
                  disabled={!subscription.monthlyPackage}
                  onPress={() => setSelectedPackage('monthly')}
                />
              </> : <View style={styles.plusMessage}>
                <Ionicons name="cloud-offline-outline" size={18} color={COLORS.purpleDark} />
                <Text style={styles.plusMessageText}>WordWiz Plus plans are unavailable right now. Please check your connection and try again.</Text>
              </View>}

              {message ?? subscription.statusMessage ? (
                <View style={styles.plusMessage}>
                  <Ionicons name="information-circle-outline" size={18} color={COLORS.purpleDark} />
                  <Text style={styles.plusMessageText}>{message ?? subscription.statusMessage}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!hasPurchasablePlan || !selected || subscription.isPurchasing}
                onPress={() => void purchase()}
                style={({ pressed }) => [styles.plusSubscribeButton, (!selected || subscription.isPurchasing) && styles.plusButtonDisabled, pressed && styles.pressed]}
              >
                {subscription.isPurchasing ? <ActivityIndicator color={COLORS.white} /> : <>
                  <Text style={styles.plusSubscribeButtonText}>{trialEligible ? 'START FREE TRIAL' : 'CONTINUE'}</Text>
                  <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
                </>}
              </Pressable>
              <Text style={styles.plusRenewalText}>
                Payment is charged to your Apple ID. Your subscription renews automatically unless canceled at least 24 hours before the end of the current period.
              </Text>
            </>
          ) : (
            <View style={styles.plusMessage}>
              <Ionicons name="phone-portrait-outline" size={18} color={COLORS.purpleDark} />
              <Text style={styles.plusMessageText}>{subscription.statusMessage ?? 'Purchases are available in the WordWiz iOS app.'}</Text>
            </View>
          )}

          <View style={styles.plusSecondaryActions}>
            <Pressable accessibilityRole="button" disabled={subscription.isRestoring || !subscription.isSupported} onPress={() => void restore()} style={styles.plusSecondaryButton}>
              {subscription.isRestoring ? <ActivityIndicator color={COLORS.purpleDark} /> : <Text style={styles.plusSecondaryButtonText}>Restore Purchases</Text>}
            </Pressable>
            {subscription.hasPlusAccess ? (
              <Pressable accessibilityRole="button" onPress={() => void manage()} style={styles.plusSecondaryButton}>
                <Text style={styles.plusSecondaryButtonText}>Manage Subscription</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.plusLegalRow}>
            <Pressable onPress={() => onOpenLegal('terms')}><Text style={styles.plusLegalLink}>Terms of Use</Text></Pressable>
            <Text style={styles.plusLegalDivider}>•</Text>
            <Pressable onPress={() => onOpenLegal('privacy')}><Text style={styles.plusLegalLink}>Privacy Policy</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Benefit({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={styles.plusBenefit}><Ionicons name={icon} size={18} color={COLORS.teal} /><Text style={styles.plusBenefitText}>{text}</Text></View>;
}

function PlanOption({ title, caption, price, selected, disabled = false, badge, onPress }: { title: string; caption: string; price: string; selected: boolean; disabled?: boolean; badge?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.plusPlan, selected && styles.plusPlanSelected, disabled && styles.plusButtonDisabled, pressed && styles.pressed]}>
    <View style={[styles.plusPlanRadio, selected && styles.plusPlanRadioSelected]}>{selected ? <View style={styles.plusPlanRadioDot} /> : null}</View>
    <View style={styles.plusPlanCopy}><View style={styles.plusPlanTitleRow}><Text style={styles.plusPlanTitle}>{title}</Text>{badge ? <Text style={styles.plusPlanBadge}>{badge}</Text> : null}</View><Text style={styles.plusPlanCaption}>{caption}</Text></View>
    <Text style={styles.plusPlanPrice}>{price}</Text>
  </Pressable>;
}

function getAnnualSavingsPercent(monthly: PurchasesPackage | null, annual: PurchasesPackage | null) {
  if (!monthly || !annual || monthly.product.price <= 0) return null;
  const monthlyYear = monthly.product.price * 12;
  const saved = monthlyYear - annual.product.price;
  return saved > 0 ? Math.round((saved / monthlyYear) * 100) : null;
}
