import { ModelProfile, ModelProfileCatalog } from '../../../core/application';

/**
 * Primary supported default model profile: `llama3.1:8b` tuned for an Apple Silicon M1 16GB.
 * - Constant `numCtx: 4096` per slot so Ollama never reallocates the KV cache mid-session.
 * - 2 parallel slots recommended (`OLLAMA_NUM_PARALLEL=2`).
 * - Few-shot examples formatted as real `user`/`assistant` chat turns for reliable style transfer.
 */
export const llama3_1_8bProfile: ModelProfile = {
  id: 'llama3_1_8b',
  label: 'Llama 3.1 8B (Tuned for llama3.1:8b)',
  isRecommendedDefault: true,
  matches(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return (
      normalized === 'llama3.1:8b' ||
      normalized.startsWith('llama3.1:8b-') ||
      normalized === 'llama3.1:latest' ||
      normalized === 'llama3.1' ||
      normalized === 'demo mode'
    );
  },
  numCtx: 4096,
  parallelRecommended: 2,
  temperatures: {
    classify: 0,
    extract: 0,
    bullet: 0.4,
    summary: 0.4,
    letter: 0.6,
  },
  topP: 0.9,
  tokenCaps: {
    bullet: 80,
    summary: 110,
    letterBlock: 170,
    briefRefine: 200,
    importClassify: 450,
    jobFact: 80,
  },
  stop: ['\n'],
  keepAlive: '30m',
  fewShotStyle: 'chat-turns',
  serverEnv: [
    'OLLAMA_FLASH_ATTENTION=1',
    'OLLAMA_KV_CACHE_TYPE=q8_0',
    'OLLAMA_NUM_PARALLEL=2',
  ],
};

/**
 * Fallback profile for any other local model installed by the user.
 */
export const genericSmallProfile: ModelProfile = {
  id: 'generic_small',
  label: 'Generic Small Local Model',
  isRecommendedDefault: false,
  matches(): boolean {
    return true;
  },
  numCtx: 4096,
  parallelRecommended: 1,
  temperatures: {
    classify: 0,
    extract: 0,
    bullet: 0.35,
    summary: 0.35,
    letter: 0.5,
  },
  topP: 0.85,
  tokenCaps: {
    bullet: 80,
    summary: 110,
    letterBlock: 170,
    briefRefine: 200,
    importClassify: 450,
    jobFact: 80,
  },
  stop: ['\n'],
  keepAlive: '15m',
  fewShotStyle: 'chat-turns',
  serverEnv: [
    'OLLAMA_FLASH_ATTENTION=1',
    'OLLAMA_KV_CACHE_TYPE=q8_0',
    'OLLAMA_NUM_PARALLEL=1',
  ],
};

const REGISTERED_MODEL_PROFILES: ModelProfile[] = [
  llama3_1_8bProfile,
  genericSmallProfile,
];

export function createModelProfileCatalog(): ModelProfileCatalog {
  return {
    list() {
      return [...REGISTERED_MODEL_PROFILES];
    },
    getById(id: string) {
      return REGISTERED_MODEL_PROFILES.find((p) => p.id === id);
    },
    resolveForModel(modelName: string): ModelProfile {
      for (const profile of REGISTERED_MODEL_PROFILES) {
        if (profile.matches(modelName)) {
          return profile;
        }
      }
      return genericSmallProfile;
    },
  };
}
