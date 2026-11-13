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
    recommendedGenerationModel: 'cevin-3b-4bit-fused',
    defaultMaxSeqLength: 1024,
  },
  storageDbName: 'cevin_local_studio_db',
  minSupportedViewportWidthPx: 1024,
} as const;
