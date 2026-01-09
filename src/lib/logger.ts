import pino from "pino";

export const logger =
  process.env.NODE_ENV === "development"
    ? pino(
        {
          level: "debug",
          redact: {
            paths: ["password", "token", "apiKey", "authorization"],
            remove: true,
          },
        },
        pino.transport({
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            singleLine: false,
            levelFirst: true,
            errorLikeObjectKeys: ["err", "error"],
          },
        }),
      )
    : pino(
        {
          level: "info",
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
        },
        pino.transport({
          target: "@logtail/pino",
          options: {
            sourceToken: process.env.BETTERSTACK_TOKEN,
          },
        }),
      );

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
