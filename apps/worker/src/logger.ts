import { config } from "./config";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[config.logLevel];
}

function write(level: LogLevel, msg: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...context,
  };

  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg: string, context?: Record<string, unknown>) => write("debug", msg, context),
  info: (msg: string, context?: Record<string, unknown>) => write("info", msg, context),
  warn: (msg: string, context?: Record<string, unknown>) => write("warn", msg, context),
  error: (msg: string, context?: Record<string, unknown>) => write("error", msg, context),
};
