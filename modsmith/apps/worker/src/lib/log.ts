import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "worker", pid: process.pid },
  redact: ["password", "token", "*.password", "*.token", "*.apiKey"],
});

export type WorkerLogger = typeof log;
