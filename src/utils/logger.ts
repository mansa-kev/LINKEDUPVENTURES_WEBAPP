/**
 * Production-safe logging utility
 * Logs only in development mode to prevent exposing sensitive information in production
 */

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
const nodeEnv =
  typeof process !== 'undefined' && process.env
    ? process.env.NODE_ENV
    : undefined;
const isDev = Boolean(viteEnv?.DEV || nodeEnv !== 'production');

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  error: (...args: any[]) => {
    if (isDev) console.error(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  }
};
