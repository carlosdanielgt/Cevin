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
  label: 'Cevin model (3B 4-bit MLX)',
  isRecommendedDefault: true,
  matches(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return (
      normalized === 'cevin-3b-4bit-fused' ||
      normalized.includes('cevin-3b') ||
      normalized.includes('qwen2.5-3b') ||
      normalized === 'demo mode'
    );
  },
  maxSeqLength: 1024,
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
  fewShotStyle: 'inline',
  serverEnv: ['CEVIN_MLX_MODEL_PATH=./cevin-3b-4bit-fused'],
};

/**
 * Fallback profile for any other local model configured by the user.
 */
export const genericProfile: ModelProfile = {
  id: 'generic',
  label: 'Generic Local Model',
  isRecommendedDefault: false,
  matches(): boolean {
    return true;
  },
  maxSeqLength: 1024,
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
    bullet: 120,
    summary: 160,
    letterBlock: 220,
    briefRefine: 240,
    importClassify: 450,
    jobFact: 100,
  },
  stop: ['\n'],
  fewShotStyle: 'chat-turns',
  serverEnv: [],
};

export const genericSmallProfile = genericProfile;

const REGISTERED_MODEL_PROFILES: ModelProfile[] = [
  cevin3bMlxProfile,
  genericProfile,
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
      return genericProfile;
    },
  };
}
