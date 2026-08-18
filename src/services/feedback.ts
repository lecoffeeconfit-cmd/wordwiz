import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export const FEEDBACK_CATEGORIES = [
  'bug',
  'incorrect_word_info',
  'feature_request',
  'account_subscription',
  'general_feedback',
  'other',
] as const;

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export type FeedbackStatus = 'new' | 'reviewing' | 'in_progress' | 'resolved' | 'closed';
export type FeedbackPriority = 'low' | 'normal' | 'high' | 'critical';
export type FeedbackContext = {
  screen: string;
  wordId?: string;
  word?: string;
  section?: string;
};
export type FeedbackReport = {
  id: string;
  category: FeedbackCategory;
  subject: string;
  description: string;
  status: FeedbackStatus;
  priority: FeedbackPriority;
  screenshotPath: string | null;
  screen: string | null;
  wordId: string | null;
  word: string | null;
  wordSection: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  deviceModel: string | null;
  osVersion: string | null;
  accessStatus: string | null;
  createdAt: string;
  updatedAt: string;
};
export type FeedbackMessage = {
  id: string;
  reportId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  message: string;
  createdAt: string;
};

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('permission')) return 'Photo permission is needed to attach a screenshot.';
  return 'Feedback is temporarily unavailable. Please try again.';
}

export function feedbackCategoryLabel(category: FeedbackCategory) {
  return {
    bug: 'Report a Bug',
    incorrect_word_info: 'Incorrect Word Info',
    feature_request: 'Feature Request',
    account_subscription: 'Account / Subscription Help',
    general_feedback: 'General Feedback',
    other: 'Other',
  }[category];
}

function mapReport(row: Record<string, any>): FeedbackReport {
  return {
    id: row.id, category: row.category, subject: row.subject, description: row.description,
    status: row.status, priority: row.priority, screenshotPath: row.screenshot_path ?? null,
    screen: row.screen ?? null, wordId: row.word_id ?? null, word: row.word ?? null,
    wordSection: row.word_section ?? null, appVersion: row.app_version ?? null,
    buildNumber: row.build_number ?? null, deviceModel: row.device_model ?? null,
    osVersion: row.os_version ?? null, accessStatus: row.access_status ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapMessage(row: Record<string, any>): FeedbackMessage {
  return { id: row.id, reportId: row.report_id, senderId: row.sender_id, senderRole: row.sender_role, message: row.message, createdAt: row.created_at };
}

export async function getMyFeedbackReports() {
  const { data, error } = await supabase.from('feedback_reports').select('*').order('updated_at', { ascending: false });
  if (error) throw new Error(readableError(error));
  return (data ?? []).map(mapReport);
}

export async function getFeedbackMessages(reportId: string) {
  const { data, error } = await supabase.from('feedback_messages').select('*').eq('report_id', reportId).order('created_at');
  if (error) throw new Error(readableError(error));
  return (data ?? []).map(mapMessage);
}

export async function pickFeedbackScreenshot() {
  const [ImagePicker, imageManipulator] = await Promise.all([
    import('expo-image-picker'),
    import('expo-image-manipulator'),
  ]);
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo permission is needed to attach a screenshot.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.75, selectionLimit: 1 });
  if (result.canceled || !result.assets[0]) return null;
  // Normalize HEIC/WebP and large screenshots before upload so the private
  // bucket only needs one safe, portable image format.
  const image = await imageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 1440 } }],
    { compress: 0.8, format: imageManipulator.SaveFormat.JPEG },
  );
  return { ...result.assets[0], uri: image.uri, mimeType: 'image/jpeg' };
}

async function uploadScreenshot(uri: string, mimeType?: string | null) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Please sign in and try again.');
  const bytes = await (await fetch(uri)).arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) throw new Error('Choose a screenshot smaller than 4 MB.');
  const path = `${userData.user.id}/${Date.now()}-feedback.jpg`;
  const { error } = await supabase.storage.from('feedback-screenshots').upload(path, bytes, {
    contentType: mimeType || 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (error) throw new Error('Could not upload the screenshot. Please try again.');
  return path;
}

export async function getFeedbackScreenshotUrl(path: string | null) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('feedback-screenshots').createSignedUrl(path, 60 * 10);
  return error ? null : data.signedUrl;
}

export async function createFeedbackReport(input: {
  category: FeedbackCategory;
  subject: string;
  description: string;
  context: FeedbackContext;
  accessStatus: string;
  screenshot?: { uri: string; mimeType?: string | null } | null;
}) {
  const screenshotPath = input.screenshot ? await uploadScreenshot(input.screenshot.uri, input.screenshot.mimeType) : null;
  // Keep these optional native helpers out of the startup import graph. This
  // lets an OTA update remain safe for an older installed binary; reports
  // simply use the portable fallbacks until that binary is rebuilt.
  const [application, device] = await Promise.all([
    import('expo-application').catch(() => null),
    import('expo-device').catch(() => null),
  ]);
  const { data, error } = await supabase.from('feedback_reports').insert({
    category: input.category,
    subject: input.subject.trim(),
    description: input.description.trim(),
    screenshot_path: screenshotPath,
    screen: input.context.screen,
    word_id: input.context.wordId ?? null,
    word: input.context.word ?? null,
    word_section: input.context.section ?? null,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    build_number: application?.nativeBuildVersion ?? Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode?.toString() ?? null,
    device_model: device?.modelName ?? Platform.OS,
    os_version: `${Platform.OS} ${Platform.Version}`,
    access_status: input.accessStatus,
  }).select('*').single();
  if (error) {
    if (screenshotPath) await supabase.storage.from('feedback-screenshots').remove([screenshotPath]);
    throw new Error(readableError(error));
  }
  return mapReport(data);
}
