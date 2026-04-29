type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

export function createLogger(component: string) {
  return {
    debug(message: string, context?: Record<string, unknown>) {
      if (shouldLog("debug"))
        console.debug(formatMessage("debug", component, message, context));
    },
    info(message: string, context?: Record<string, unknown>) {
      if (shouldLog("info"))
        console.info(formatMessage("info", component, message, context));
    },
    warn(message: string, context?: Record<string, unknown>) {
      if (shouldLog("warn"))
        console.warn(formatMessage("warn", component, message, context));
    },
    error(message: string, context?: Record<string, unknown>) {
      if (shouldLog("error"))
        console.error(formatMessage("error", component, message, context));
    },
  };
}
