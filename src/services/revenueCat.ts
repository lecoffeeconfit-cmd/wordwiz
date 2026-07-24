import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { AppState, Linking, NativeModules, Platform } from 'react-native';
import { env } from '../config/env';
import { reportError } from './errorReporting';

// This is case-sensitive and must exactly match the RevenueCat entitlement.
export const PLUS_ENTITLEMENT_ID = 'Plus';

export type RevenueCatSnapshot = {
  userId: string | null;
  customerInfo: CustomerInfo | null;
  currentOffering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  annualPackage: PurchasesPackage | null;
  isLoading: boolean;
  isPurchasing: boolean;
  isRestoring: boolean;
  isSupported: boolean;
  statusMessage: string | null;
};

export type PurchaseResult =
  | { status: 'success'; customerInfo: CustomerInfo }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

export type RestoreResult =
  | { status: 'restored'; customerInfo: CustomerInfo }
  | { status: 'not-found'; customerInfo: CustomerInfo }
  | { status: 'failed'; message: string };

type SnapshotListener = (snapshot: RevenueCatSnapshot) => void;

const initialSnapshot: RevenueCatSnapshot = {
  userId: null,
  customerInfo: null,
  currentOffering: null,
  monthlyPackage: null,
  annualPackage: null,
  isLoading: false,
  isPurchasing: false,
  isRestoring: false,
  isSupported: false,
  statusMessage: null,
};

class RevenueCatService {
  private snapshot = initialSnapshot;
  private listeners = new Set<SnapshotListener>();
  private isConfigured = false;
  private configuredUserId: string | null = null;
  private syncGeneration = 0;
  private syncQueue: Promise<void> = Promise.resolve();
  private customerInfoListener: ((info: CustomerInfo) => void) | null = null;

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.snapshot;
  }

  hasPlusAccess() {
    return hasPlusAccess(this.snapshot.customerInfo);
  }

  syncUser(userId: string | null) {
    const task = this.syncQueue.then(() => this.performSyncUser(userId));
    this.syncQueue = task.catch(() => undefined);
    return task;
  }

  private async performSyncUser(userId: string | null) {
    const generation = ++this.syncGeneration;

    if (!userId) {
      if (this.isConfigured) {
        try {
          await Purchases.logOut();
        } catch (error) {
          reportError(error, { area: 'revenuecat_logout' });
        }
      }
      if (generation === this.syncGeneration) {
        this.configuredUserId = null;
        this.setSnapshot({ ...initialSnapshot, isSupported: this.isNativeAvailable() });
      }
      return;
    }

    if (!this.isNativeAvailable()) {
      this.setSnapshot({
        ...initialSnapshot,
        userId,
        isSupported: false,
        statusMessage: getUnsupportedMessage(),
      });
      return;
    }

    this.setSnapshot({
      ...initialSnapshot,
      userId,
      isSupported: true,
      isLoading: true,
      statusMessage: null,
    });

    try {
      let customerInfo: CustomerInfo;
      if (!this.isConfigured) {
        Purchases.configure({
          apiKey: env.revenueCatIosApiKey!.trim(),
          appUserID: userId,
        });
        this.isConfigured = true;
        this.configuredUserId = userId;
        this.attachCustomerInfoListener();
        customerInfo = await Purchases.getCustomerInfo();
      } else if (this.configuredUserId !== userId) {
        const result = await Purchases.logIn(userId);
        this.configuredUserId = userId;
        customerInfo = result.customerInfo;
      } else {
        customerInfo = await Purchases.getCustomerInfo();
      }
      this.attachCustomerInfoListener();

      const offering = await Purchases.getOfferings();
      if (generation !== this.syncGeneration) return;
      this.updateCustomerInfo(customerInfo, offering.current);
      this.setSnapshot({ ...this.snapshot, isLoading: false, statusMessage: null });
    } catch (error) {
      reportError(error, { area: 'revenuecat_sync_user' });
      if (generation !== this.syncGeneration) return;
      this.setSnapshot({
        ...this.snapshot,
        userId,
        isLoading: false,
        statusMessage: 'Subscription status is temporarily unavailable. Your saved learning data is still here.',
      });
    }
  }

  async refresh() {
    if (!this.isConfigured || !this.snapshot.userId || !this.isNativeAvailable()) return;

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const offering = await Purchases.getOfferings();
      this.updateCustomerInfo(customerInfo, offering.current);
    } catch (error) {
      reportError(error, { area: 'revenuecat_refresh' });
      this.setSnapshot({
        ...this.snapshot,
        statusMessage: 'Subscription status is temporarily unavailable. Your last verified access is still being used.',
      });
    }
  }

  async purchase(aPackage: PurchasesPackage): Promise<PurchaseResult> {
    if (!this.isConfigured || !this.isNativeAvailable()) {
      return { status: 'failed', message: getUnsupportedMessage() };
    }
    if (this.snapshot.isPurchasing) {
      return { status: 'failed', message: 'A purchase is already in progress.' };
    }

    this.setSnapshot({ ...this.snapshot, isPurchasing: true, statusMessage: null });
    try {
      const result = await Purchases.purchasePackage(aPackage);
      const customerInfo = result.customerInfo;
      this.updateCustomerInfo(customerInfo, this.snapshot.currentOffering);
      if (!hasPlusAccess(customerInfo)) {
        return {
          status: 'failed',
          message: 'Your purchase is still being confirmed. Please try Restore Purchases in a moment.',
        };
      }
      return { status: 'success', customerInfo };
    } catch (error) {
      if (isPurchaseCancelled(error)) return { status: 'cancelled' };
      reportError(error, { area: 'revenuecat_purchase' });
      return {
        status: 'failed',
        message: 'We could not complete that purchase. Please check your connection and try again.',
      };
    } finally {
      this.setSnapshot({ ...this.snapshot, isPurchasing: false });
    }
  }

  async restore(): Promise<RestoreResult> {
    if (!this.isConfigured || !this.isNativeAvailable()) {
      return { status: 'failed', message: getUnsupportedMessage() };
    }
    if (this.snapshot.isRestoring) {
      return { status: 'failed', message: 'Restore is already in progress.' };
    }

    this.setSnapshot({ ...this.snapshot, isRestoring: true, statusMessage: null });
    try {
      const customerInfo = await Purchases.restorePurchases();
      this.updateCustomerInfo(customerInfo, this.snapshot.currentOffering);
      return hasPlusAccess(customerInfo)
        ? { status: 'restored', customerInfo }
        : { status: 'not-found', customerInfo };
    } catch (error) {
      reportError(error, { area: 'revenuecat_restore' });
      return {
        status: 'failed',
        message: 'We could not restore purchases right now. Please try again shortly.',
      };
    } finally {
      this.setSnapshot({ ...this.snapshot, isRestoring: false });
    }
  }

  async manageSubscription() {
    if (!this.isConfigured || !this.isNativeAvailable()) {
      throw new Error(getUnsupportedMessage());
    }
    const managementUrl = this.snapshot.customerInfo?.managementURL;
    if (managementUrl) {
      const canOpen = await Linking.canOpenURL(managementUrl);
      if (canOpen) {
        await Linking.openURL(managementUrl);
        return;
      }
    }
    await Purchases.showManageSubscriptions();
  }

  attachAppStateListener() {
    return AppState.addEventListener('change', (state) => {
      if (state === 'active') void this.refresh();
    });
  }

  teardown() {
    if (this.customerInfoListener) {
      Purchases.removeCustomerInfoUpdateListener(this.customerInfoListener);
      this.customerInfoListener = null;
    }
  }

  private attachCustomerInfoListener() {
    if (this.customerInfoListener) return;
    this.customerInfoListener = (customerInfo) => {
      this.updateCustomerInfo(customerInfo, this.snapshot.currentOffering);
    };
    Purchases.addCustomerInfoUpdateListener(this.customerInfoListener);
  }

  private updateCustomerInfo(
    customerInfo: CustomerInfo,
    currentOffering: PurchasesOffering | null,
  ) {
    this.setSnapshot({
      ...this.snapshot,
      customerInfo,
      currentOffering,
      monthlyPackage: currentOffering?.monthly ?? null,
      annualPackage: currentOffering?.annual ?? null,
    });
  }

  private isNativeAvailable() {
    return Platform.OS === 'ios' &&
      Boolean(env.revenueCatIosApiKey?.trim()) &&
      Boolean(NativeModules.RNPurchases);
  }

  private setSnapshot(next: RevenueCatSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener(next));
  }
}

export function hasPlusAccess(customerInfo: CustomerInfo | null | undefined) {
  return Boolean(customerInfo?.entitlements.active[PLUS_ENTITLEMENT_ID]);
}

function getUnsupportedMessage() {
  if (!env.isRevenueCatIosConfigured) {
    return 'Subscriptions are not configured in this build yet.';
  }
  if (Platform.OS === 'web') {
    return 'Apple in-app purchases are available in the WordWiz iOS app.';
  }
  return 'Purchases need an EAS development build or TestFlight build. They are not available in Expo Go.';
}

function isPurchaseCancelled(error: unknown) {
  const purchaseError = error as { userCancelled?: boolean; code?: unknown };
  return Boolean(purchaseError.userCancelled) ||
    purchaseError.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

export const revenueCat = new RevenueCatService();
