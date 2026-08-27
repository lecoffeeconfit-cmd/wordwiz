import type { WordWizWidgetSnapshot } from './types';

export type WordWizWidgetUpdater = {
  updateSnapshot: (snapshot: WordWizWidgetSnapshot) => void;
  updateTimeline: (entries: Array<{ date: Date; props: WordWizWidgetSnapshot }>) => void;
  reload: () => void;
};

/** Web and Android use the editor/preview; the native widget is iOS-only. */
export const WordWizWidget: WordWizWidgetUpdater = {
  updateSnapshot: () => undefined,
  updateTimeline: () => undefined,
  reload: () => undefined,
};
