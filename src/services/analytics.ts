export type AnalyticsEventName =
  | 'app_opened'
  | 'onboarding_completed'
  | 'word_saved'
  | 'word_deleted'
  | 'word_flag_toggled'
  | 'word_focus_toggled'
  | 'study_set_created'
  | 'word_review_next_toggled'
  | 'word_practice_exclusion_toggled'
  | 'wordwiz_collection_added'
  | 'card_review_recorded'
  | 'quiz_started'
  | 'quiz_completed'
  | 'timed_learning_toggled'
  | 'reminder_updated'
  | 'cloud_sync_failed';

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

type AnalyticsClient = {
  track: (eventName: AnalyticsEventName, properties?: AnalyticsProperties) => void;
};

let analyticsClient: AnalyticsClient | null = null;

export function configureAnalytics(client: AnalyticsClient | null) {
  analyticsClient = client;
}

export function trackEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
) {
  try {
    analyticsClient?.track(eventName, properties);
    if (__DEV__ && !analyticsClient) {
      console.info('[analytics]', eventName, properties);
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[analytics] event failed', eventName, error);
    }
  }
}
