import { ModelProfile, ModelProfileCatalog } from '../../../core/application';

/**
 * Primary default model profile: `cevin-3b-4bit-fused` (based on `mlx-community/Qwen2.5-3B-Instruct-4bit`
 * fine-tuned with Apple MLX LoRA across all layers with `mask_prompt: true` and `max_seq_length: 1024`).
 * - Raw string truncation is strictly disabled (`disableRawPromptTrimming: true`) so structured
 *   `TASK:` headers and JSON payloads are never clipped mid-object.
 * - Domain pre-processors slice JDs and candidate bank records before prompt construction.
 */
export const cevin3bMlxProfile: ModelProfile = {
  id: 'cevin_3b_mlx',
  label: 'Cevin 3B Fine-Tuned (MLX 4-bit)',
  isRecommendedDefault: true,
  matches(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return (
      normalized === 'cevin-3b-4bit-fused' ||
      normalized.includes('cevin-3b') ||
      normalized.includes('qwen2.5-3b')
    );
  },
  numCtx: 1024,
  parallelRecommended: 1,
  disableRawPromptTrimming: true,
  temperatures: {
    classify: 0.0,
    extract: 0.0,
    bullet: 0.0,
    summary: 0.2,
    letter: 0.2,
  },
  topP: 0.9,
  tokenCaps: {
    bullet: 512,
    summary: 512,
    letterBlock: 512,
    briefRefine: 512,
    importClassify: 512,
    jobFact: 512,
  },
  stop: [],
  keepAlive: '30m',
  fewShotStyle: 'inline',
  serverEnv: ['CEVIN_MLX_MODEL_PATH=./cevin-3b-4bit-fused'],
};

/**
 * Legacy fallback model profile: `llama3.1:8b` tuned for an Apple Silicon M1 16GB.
 * - Constant `numCtx: 4096` per slot so Ollama never reallocates the KV cache mid-session.
 * - 2 parallel slots recommended (`OLLAMA_NUM_PARALLEL=2`).
 * - Few-shot examples formatted as real `user`/`assistant` chat turns for reliable style transfer.
 */
export const llama3_1_8bProfile: ModelProfile = {
  id: 'llama3_1_8b',
  label: 'Llama 3.1 8B (Tuned for llama3.1:8b)',
  isRecommendedDefault: false,
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
  disableRawPromptTrimming: false,
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
  disableRawPromptTrimming: false,
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
  cevin3bMlxProfile,
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

