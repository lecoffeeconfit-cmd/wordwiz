import type { StartupFailureCode, StartupStage } from './startup';

/**
 * A small, side-effect-free state machine for the visible startup path.
 * Keeping this separate from React makes it impossible for a retry or a
 * timeout to leave the UI in an unrepresented "still loading" state.
 */
export type StartupStatus = 'booting' | 'ready' | 'failed' | 'offline';

export type StartupState = {
  attempt: number;
  status: StartupStatus;
  stage: StartupStage;
  failureCode: StartupFailureCode | null;
};

export const initialStartupState: StartupState = {
  attempt: 0,
  status: 'booting',
  stage: 'js_entry',
  failureCode: null,
};

export function beginStartupAttempt(state: StartupState): StartupState {
  return {
    attempt: state.attempt + 1,
    status: 'booting',
    stage: 'js_entry',
    failureCode: null,
  };
}

export function setStartupStage(
  state: StartupState,
  stage: StartupStage,
): StartupState {
  return state.status === 'booting' ? { ...state, stage } : state;
}

export function completeStartup(state: StartupState): StartupState {
  return {
    ...state,
    status: 'ready',
    stage: 'loading_state',
    failureCode: null,
  };
}

export function failStartup(
  state: StartupState,
  stage: StartupStage,
  failureCode: StartupFailureCode,
): StartupState {
  return { ...state, status: 'failed', stage, failureCode };
}

export function continueStartupOffline(state: StartupState): StartupState {
  return {
    ...state,
    status: 'offline',
    stage: 'loading_state',
  };
}

export function getStartupDiagnosticCode(state: StartupState): string {
  return state.failureCode ?? 'STARTUP_UNKNOWN';
}
