import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import { canAddWord, canUseQuizzes, hasPlusAccess, revenueCat, type PurchaseResult, type RestoreResult, type RevenueCatSnapshot } from '../services/revenueCat';

type SubscriptionContextValue = RevenueCatSnapshot & {
  hasPlusAccess: boolean;
  canUseQuizzes: boolean;
  canAddWord: (wordsAddedThisMonth: number | null) => boolean;
  syncUser: (userId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  purchase: (aPackage: PurchasesPackage) => Promise<PurchaseResult>;
  restore: () => Promise<RestoreResult>;
  manageSubscription: () => Promise<void>;
  isEligibleForTrial: () => Promise<boolean>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RevenueCatSnapshot>(revenueCat.getSnapshot());

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

  const syncUser = useCallback((userId: string | null) => revenueCat.syncUser(userId), []);
  const refresh = useCallback(() => revenueCat.refresh(), []);
  const purchase = useCallback((aPackage: PurchasesPackage) => revenueCat.purchase(aPackage), []);
  const restore = useCallback(() => revenueCat.restore(), []);
  const manageSubscription = useCallback(() => revenueCat.manageSubscription(), []);
  const isEligibleForTrial = useCallback(() => revenueCat.isEligibleForTrial(), []);

  const value = useMemo<SubscriptionContextValue>(() => ({
    ...snapshot,
    hasPlusAccess: hasPlusAccess(snapshot.customerInfo),
    canUseQuizzes: canUseQuizzes(snapshot.customerInfo),
    canAddWord: (wordsAddedThisMonth) => canAddWord(snapshot.customerInfo, wordsAddedThisMonth),
    syncUser,
    refresh,
    purchase,
    restore,
    manageSubscription,
    isEligibleForTrial,
  }), [isEligibleForTrial, manageSubscription, purchase, refresh, restore, snapshot, syncUser]);

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
