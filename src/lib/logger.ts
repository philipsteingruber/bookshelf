import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty" }
      : undefined,
  redact: {
    paths: ["password", "token", "apiKey", "authorization"],
    remove: true,
  },
  base: {
    env: process.env.NODE_ENV,
    deployment: process.env.VERCEL_URL,
    region: process.env.VERCEL_REGION,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
}

export const createLoggerWithContext = (context: LogContext) => {
  return logger.child(context);
};

export const performanceLogger = (
  operation: string,
  threshold: number = 1000,
  loggerInstance: pino.Logger = logger,
) => {
  let startTime: number;

  return {
    start: () => {
      startTime = Date.now();
      loggerInstance.debug({ operation }, `Starting - ${operation}`);
    },
    end: (metadata?: Record<string, unknown>) => {
      const duration = Date.now() - startTime;
      const logData = { operation, duration, ...metadata };

      if (duration > threshold) {
        loggerInstance.warn(
          logData,
          `Slow operation: ${operation} took ${duration}ms (threshold: ${threshold}ms)`,
        );
      } else {
        loggerInstance.debug(
          logData,
          `Completed - ${operation} in ${duration}ms`,
        );
      }

      return duration;
    },
  };
};
