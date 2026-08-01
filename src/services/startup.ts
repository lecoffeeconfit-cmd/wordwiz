import { addStartupBreadcrumb, captureStartupException } from './sentry';

export const STARTUP_TIMEOUT_MS = 12_000;

const startupStageStartedAt = new Map<StartupStage, number>();
const reportedStartupFailures = new WeakSet<object>();

export type StartupStage =
  | 'js_entry'
  | 'environment'
  | 'assets'
  | 'supabase_client'
  | 'auth_session'
  | 'profile_data'
  | 'complimentary_access'
  | 'revenuecat'
  | 'navigation'
  | 'splash'
  | 'loading_state';

export type StartupFailureCode =
  | 'STARTUP_ENTRY_FAILED'
  | 'STARTUP_ENV_FAILED'
  | 'STARTUP_ASSETS_FAILED'
  | 'STARTUP_SUPABASE_FAILED'
  | 'STARTUP_AUTH_FAILED'
  | 'STARTUP_PROFILE_FAILED'
  | 'STARTUP_ACCESS_FAILED'
  | 'STARTUP_REVENUECAT_FAILED'
  | 'STARTUP_NAVIGATION_FAILED'
  | 'STARTUP_SPLASH_FAILED';

const failureCodes: Record<Exclude<StartupStage, 'js_entry' | 'loading_state'>, StartupFailureCode> = {
  environment: 'STARTUP_ENV_FAILED',
  assets: 'STARTUP_ASSETS_FAILED',
  supabase_client: 'STARTUP_SUPABASE_FAILED',
  auth_session: 'STARTUP_AUTH_FAILED',
  profile_data: 'STARTUP_PROFILE_FAILED',
  complimentary_access: 'STARTUP_ACCESS_FAILED',
  revenuecat: 'STARTUP_REVENUECAT_FAILED',
  navigation: 'STARTUP_NAVIGATION_FAILED',
  splash: 'STARTUP_SPLASH_FAILED',
};

const startupLogLabels: Record<StartupStage, string> = {
  js_entry: 'APP_START',
  environment: 'APP_START',
  assets: 'APP_START',
  supabase_client: 'SUPABASE_INITIALIZED',
  auth_session: 'SESSION_RESTORED',
  profile_data: 'PROFILE_LOADED',
  complimentary_access: 'ACCESS_STATUS_LOADED',
  revenuecat: 'REVENUECAT_INITIALIZED',
  navigation: 'STARTUP_COMPLETE',
  splash: 'STARTUP_COMPLETE',
  loading_state: 'STARTUP_COMPLETE',
};

const startupStageRequirement: Record<StartupStage, 'required' | 'optional'> = {
  js_entry: 'required',
  environment: 'required',
  assets: 'required',
  supabase_client: 'required',
  auth_session: 'required',
  profile_data: 'required',
  complimentary_access: 'optional',
  revenuecat: 'optional',
  navigation: 'required',
  splash: 'required',
  loading_state: 'required',
};

export function reportStartupStage(stage: StartupStage, status: 'started' | 'completed' = 'started') {
  const now = Date.now();
  if (status === 'started') {
    startupStageStartedAt.set(stage, now);
  }
  const durationMs = status === 'completed'
    ? Math.max(0, now - (startupStageStartedAt.get(stage) ?? now))
    : undefined;
  console.info(`[WordWiz Startup] ${startupLogLabels[stage]} ${status}`, {
    stage,
    required: startupStageRequirement[stage] === 'required',
    durationMs,
  });
  addStartupBreadcrumb(stage, status);
}

export function getStartupFailureCode(stage: Exclude<StartupStage, 'js_entry' | 'loading_state'>) {
  return failureCodes[stage];
}

export function reportStartupFailure(
  error: unknown,
  stage: Exclude<StartupStage, 'js_entry' | 'loading_state'>,
) {
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
    reportedStartupFailures.add(error);
  }
  const code = getStartupFailureCode(stage);
  console.error(`[WordWiz Startup] STARTUP_ERROR ${code}`, {
    stage,
    required: startupStageRequirement[stage] === 'required',
    error,
  });
  captureStartupException(error, stage, code);
  return code;
}

export function wasStartupFailureReported(error: unknown) {
  return error !== null &&
    (typeof error === 'object' || typeof error === 'function') &&
    reportedStartupFailures.has(error);
}

export async function withStartupTimeout<T>(
  stage: Exclude<StartupStage, 'js_entry' | 'loading_state'>,
  operation: () => Promise<T>,
): Promise<T> {
  reportStartupStage(stage, 'started');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Startup stage timed out: ${stage}`));
        }, STARTUP_TIMEOUT_MS);
      }),
    ]);
    reportStartupStage(stage, 'completed');
    return result;
  } catch (error) {
    reportStartupFailure(error, stage);
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
