import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  getOrStartComplimentaryAccess,
  hasPlusAccess as hasActiveRevenueCatEntitlement,
  revenueCat,
  type ComplimentaryAccess,
  type PurchaseResult,
  type RestoreResult,
  type RevenueCatSnapshot,
} from '../services';

export type AccessSource = 'subscription' | 'complimentary' | 'free';

type SubscriptionContextValue = RevenueCatSnapshot & {
  hasActiveRevenueCatEntitlement: boolean;
  hasActiveComplimentaryAccess: boolean;
  hasPlusAccess: boolean;
  accessSource: AccessSource;
  complimentaryStartedAt: string | null;
  complimentaryExpiresAt: string | null;
  complimentaryDaysRemaining: number;
  complimentaryJustStarted: boolean;
  monthlyWordsAdded: number | null;
  monthlyWordLimit: number;
  monthlyWordsRemaining: number | null;
  currentPlan: string;
  isAccessLoading: boolean;
  accessError: string | null;
  canUseQuizzes: boolean;
  canAddWord: boolean;
  syncUser: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  purchase: (aPackage: PurchasesPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
  manageSubscription: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const EMPTY_ACCESS: ComplimentaryAccess = {
  startedAt: null,
  expiresAt: null,
  isActive: false,
  startedThisSession: false,
  daysRemaining: 0,
  monthlyWordsAdded: 0,
  monthlyWordLimit: 10,
  monthlyWordsRemaining: 10,
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RevenueCatSnapshot>(revenueCat.getSnapshot());
  const [complimentaryAccess, setComplimentaryAccess] = useState<ComplimentaryAccess | null>(null);
  const [isAccessLoading, setIsAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const activeUserId = useRef<string | null>(null);
  const accessGeneration = useRef(0);

  useEffect(() => {
    const unsubscribe = revenueCat.subscribe(setSnapshot);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscription = revenueCat.attachAppStateListener();
    return () => {
      subscription.remove();
      revenueCat.teardown();
    };
  }, []);

  const refreshAccessForUser = useCallback(async (userId: string | null) => {
    const generation = ++accessGeneration.current;
    if (!userId) {
      setComplimentaryAccess(null);
      setAccessError(null);
      setIsAccessLoading(false);
      return;
    }

    setIsAccessLoading(true);
    setAccessError(null);
    try {
      const access = await getOrStartComplimentaryAccess();
      if (generation !== accessGeneration.current || activeUserId.current !== userId) return;
      setComplimentaryAccess(access);
    } catch (error) {
      if (generation !== accessGeneration.current || activeUserId.current !== userId) return;
      setComplimentaryAccess(null);
      setAccessError(
        error instanceof Error
          ? error.message
          : 'WordWiz could not check access right now.',
      );
    } finally {
      if (generation === accessGeneration.current && activeUserId.current === userId) {
        setIsAccessLoading(false);
      }
    }
  }, []);

  const syncUser = useCallback(async (userId: string | null) => {
    activeUserId.current = userId;
    if (!userId) {
      await revenueCat.syncUser(null);
      await refreshAccessForUser(null);
      return;
    }

    await Promise.all([
      revenueCat.syncUser(userId),
      refreshAccessForUser(userId),
    ]);
  }, [refreshAccessForUser]);

  const refreshAccess = useCallback(
    () => refreshAccessForUser(activeUserId.current),
    [refreshAccessForUser],
  );
  const refresh = useCallback(
    async () => {
      await Promise.all([revenueCat.refresh(), refreshAccess()]);
    },
    [refreshAccess],
  );
  const purchase = useCallback((aPackage: PurchasesPackage) => revenueCat.purchase(aPackage), []);
  const restore = useCallback(() => revenueCat.restore(), []);
  const manageSubscription = useCallback(() => revenueCat.manageSubscription(), []);

  const value = useMemo<SubscriptionContextValue>(() => {
    const hasSubscription = hasActiveRevenueCatEntitlement(snapshot.customerInfo);
    const hasComplimentary = !hasSubscription && complimentaryAccess?.isActive === true;
    const hasPlusAccess = hasSubscription || hasComplimentary;
    const accessSource: AccessSource = hasSubscription
      ? 'subscription'
      : hasComplimentary
        ? 'complimentary'
        : 'free';
    const productId = snapshot.customerInfo?.entitlements.active.Plus?.productIdentifier
      ?.toLowerCase() ?? '';
    const currentPlan = hasSubscription
      ? productId.includes('annual') || productId.includes('year')
        ? 'WordWiz Plus Annual'
        : productId.includes('month')
          ? 'WordWiz Plus Monthly'
          : 'WordWiz Plus'
      : hasComplimentary
        ? 'Complimentary WordWiz Plus'
        : 'Free';

    return {
      ...snapshot,
      hasActiveRevenueCatEntitlement: hasSubscription,
      hasActiveComplimentaryAccess: hasComplimentary,
      hasPlusAccess,
      accessSource,
      complimentaryStartedAt: complimentaryAccess?.startedAt ?? null,
      complimentaryExpiresAt: complimentaryAccess?.expiresAt ?? null,
      complimentaryDaysRemaining: complimentaryAccess?.daysRemaining ?? 0,
      complimentaryJustStarted: complimentaryAccess?.startedThisSession === true,
      monthlyWordsAdded: complimentaryAccess ? complimentaryAccess.monthlyWordsAdded : null,
      monthlyWordLimit: complimentaryAccess?.monthlyWordLimit ?? 10,
      monthlyWordsRemaining: complimentaryAccess ? complimentaryAccess.monthlyWordsRemaining : null,
      currentPlan,
      isAccessLoading,
      accessError,
      canUseQuizzes: hasPlusAccess,
      canAddWord: hasPlusAccess || (complimentaryAccess?.monthlyWordsRemaining ?? 0) > 0,
      syncUser,
      refresh,
      refreshAccess,
      purchase,
      restore,
      manageSubscription,
    };
  }, [accessError, complimentaryAccess, isAccessLoading, manageSubscription, purchase, refresh, refreshAccess, restore, snapshot, syncUser]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used inside SubscriptionProvider.');
  }
  return context;
}
