export type CardSwipeDirection = 'previous' | 'next';

export const CARD_SWIPE_ACTIVATION_DISTANCE = 14;
export const CARD_SWIPE_TRIGGER_DISTANCE = 56;
export const CARD_SWIPE_DIRECTION_RATIO = 1.25;

/** Returns true once a gesture is clearly horizontal enough to claim. */
export function isHorizontalCardGesture(dx: number, dy: number) {
  return (
    Math.abs(dx) > CARD_SWIPE_ACTIVATION_DISTANCE &&
    Math.abs(dx) > Math.abs(dy) * CARD_SWIPE_DIRECTION_RATIO
  );
}

/** Converts a completed horizontal drag into card navigation, or ignores it. */
export function getCardSwipeDirection(
  dx: number,
  dy: number,
): CardSwipeDirection | null {
  if (
    Math.abs(dx) < CARD_SWIPE_TRIGGER_DISTANCE ||
    Math.abs(dx) <= Math.abs(dy) * CARD_SWIPE_DIRECTION_RATIO
  ) {
    return null;
  }

  return dx < 0 ? 'next' : 'previous';
}
