import type { ReminderSettings } from '../types';

export function getDayKey() {
  const date = new Date();
  return getDayKeyForDate(date);
}

export function getDayKeyForDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return getDayKeyForDate(date);
}

export function formatReminderTime(settings: ReminderSettings) {
  const date = new Date();
  date.setHours(settings.hour, settings.minute, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getRecentDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - index - 1));
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return {
      key: `${year}-${month}-${day}`,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
    };
  });
}

export function formatWordAddedDate(createdAt: string, now = new Date()) {
  const addedAt = new Date(createdAt);
  if (Number.isNaN(addedAt.getTime())) {
    return 'Added recently';
  }

  if (isSameCalendarDay(addedAt, now)) {
    return 'Added today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameCalendarDay(addedAt, yesterday)) {
    return 'Added yesterday';
  }

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
  };
  if (addedAt.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }

  return `Added ${addedAt.toLocaleDateString('en-US', options)}`;
}

function isSameCalendarDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}
