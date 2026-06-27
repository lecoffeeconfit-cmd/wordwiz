export type ErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>;

type ErrorReporter = {
  captureException: (error: unknown, context?: ErrorContext) => void;
  captureMessage?: (message: string, context?: ErrorContext) => void;
};

let errorReporter: ErrorReporter | null = null;

export function configureErrorReporting(reporter: ErrorReporter | null) {
  errorReporter = reporter;
}

export function reportError(error: unknown, context: ErrorContext = {}) {
  try {
    errorReporter?.captureException(error, context);
    if (__DEV__ && !errorReporter) {
      console.warn('[error-reporting]', getErrorMessage(error), context);
    }
  } catch (reportingError) {
    if (__DEV__) {
      console.warn('[error-reporting] reporter failed', reportingError);
    }
  }
}

export function reportMessage(message: string, context: ErrorContext = {}) {
  try {
    errorReporter?.captureMessage?.(message, context);
    if (__DEV__ && !errorReporter) {
      console.info('[error-reporting]', message, context);
    }
  } catch (reportingError) {
    if (__DEV__) {
      console.warn('[error-reporting] reporter failed', reportingError);
    }
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}
