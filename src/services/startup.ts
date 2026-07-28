import { addStartupBreadcrumb, captureStartupException } from './sentry';

export const STARTUP_TIMEOUT_MS = 12_000;

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

export function reportStartupStage(stage: StartupStage, status: 'started' | 'completed' = 'started') {
  addStartupBreadcrumb(stage, status);
}

export function getStartupFailureCode(stage: Exclude<StartupStage, 'js_entry' | 'loading_state'>) {
  return failureCodes[stage];
}

export function reportStartupFailure(
  error: unknown,
  stage: Exclude<StartupStage, 'js_entry' | 'loading_state'>,
) {
  const code = getStartupFailureCode(stage);
  captureStartupException(error, stage, code);
  return code;
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
