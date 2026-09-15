import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "web" },
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "token", "*.password", "*.token"],
});

export type Logger = typeof logger;
