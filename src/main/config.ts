/**
 * Central application configuration constants.
 * Kept in `main/config.ts` so no magic constants are scattered across adapters.
 */
export const APP_CONFIG = {
  appName: 'Cevin',
  version: '1.0.0',
  defaultPort: 8080,
  mlxDefaults: {
    baseUrl: 'http://localhost:8000',
    recommendedGenerationModel: 'Qwen2.5-1.5B-Instruct-4bit',
    defaultMaxSeqLength: 1024,
  },
  storageDbName: 'cevin_local_studio_db',
  minSupportedViewportWidthPx: 1024,
} as const;
