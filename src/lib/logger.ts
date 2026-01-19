import pino from "pino";

import { env } from "@/env";

export const logger =
  env.NODE_ENV === "development"
    ? pino(
        {
          level: "info",
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
            env: env.NODE_ENV,
            deployment: env.VERCEL_URL,
            region: env.VERCEL_REGION,
          },
          timestamp: pino.stdTimeFunctions.isoTime,
        },
        {
          write: (log: string) => {
            try {
              const logEntry = JSON.parse(log);

              // Map Pino numeric levels to string names
              const levelMap: Record<number, string> = {
                10: "trace",
                20: "debug",
                30: "info",
                40: "warn",
                50: "error",
                60: "fatal",
              };

              // Send to Logtail via HTTP
              if (env.BETTERSTACK_TOKEN) {
                const endpoint =
                  env.BETTERSTACK_INGESTING_HOST || "https://in.logtail.com/";

                // Prepare payload with only relevant fields
                const { time, level, msg, ...customFields } = logEntry;

                const payload = {
                  dt: time
                    ? new Date(time).toISOString()
                    : new Date().toISOString(),
                  level: levelMap[level] || "info",
                  message: msg || "",
                  ...customFields, // Includes ALL your custom metadata
                };

                fetch(endpoint, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${env.BETTERSTACK_TOKEN}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(payload),
                })
                  .then((res) => {
                    if (!res.ok) {
                      console.error(
                        `Logtail error: ${res.status} ${res.statusText}`,
                      );
                    }
                  })
                  .catch((err) => {
                    // Don't break the app if logging fails
                    console.error("Logtail fetch error:", err);
                  });
              } else {
                // Fallback to console if no token
                console.log(log);
              }
            } catch (err) {
              console.error("Log parsing error:", err);
            }
          },
        },
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
