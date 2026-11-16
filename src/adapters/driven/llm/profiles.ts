import { ModelProfile, ModelProfileCatalog } from '../../../core/application';

/**
 * New recommended default fine-tuned model profile: `Qwen2.5-1.5B-Instruct-4bit`
 * (Qwen2.5-1.5B fused with Rank-32 LoRA weights trained with `mask_prompt: true`
 * and `max_seq_length: 1024` on the exact same Cevin dataset, ~1.15 GB unified memory).
 * - Uses identical `inline` prompt formatting (no few-shot turns, no extra JSON schema hints).
 * - Raw string truncation is strictly disabled (`disableRawPromptTrimming: true`).
 */
export const qwen25_1_5bMlxProfile: ModelProfile = {
  id: 'qwen25_1_5b_mlx',
  label: 'Qwen2.5 1.5B Fine-Tuned (4-bit MLX)',
  description:
    'Fine-tuned Qwen2.5-1.5B Rank-32 LoRA model trained on structured career reasoning (~1.2 GB RAM).',
  estimatedMemoryGb: 1.15,
  isRecommendedDefault: true,
  matches(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return (
      normalized === 'qwen2.5-1.5b-instruct-4bit' ||
      normalized === 'cevin-1.5b-4bit-fused' ||
      normalized.includes('qwen2.5-1.5b') ||
      normalized.includes('cevin-1.5b') ||
      normalized.includes('1.5b-instruct') ||
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
  serverEnv: [
    'CEVIN_MLX_DEFAULT_MODEL=Qwen2.5-1.5B-Instruct-4bit',
    'CEVIN_MLX_1_5B_PATH=./cevin-1.5b-4bit-fused',
  ],
};

/**
 * Fine-tuned Cevin 3B model profile: `cevin-3b-4bit-fused`
 * (based on `mlx-community/Qwen2.5-3B-Instruct-4bit` fine-tuned with Apple MLX LoRA across all
 * layers with `mask_prompt: true` and `max_seq_length: 1024`, ~2.73 GB unified memory).
 * - Raw string truncation is strictly disabled (`disableRawPromptTrimming: true`) so structured
 *   `TASK:` headers and JSON payloads are never clipped mid-object.
 */
export const cevin3bMlxProfile: ModelProfile = {
  id: 'cevin_3b_mlx',
  label: 'Cevin 3B Fine-Tuned (4-bit MLX)',
  description:
    'Fine-tuned Qwen2.5-3B LoRA model trained on structured career reasoning (~2.7 GB RAM).',
  estimatedMemoryGb: 2.73,
  isRecommendedDefault: false,
  matches(modelName: string): boolean {
    const normalized = modelName.trim().toLowerCase();
    return (
      normalized === 'cevin-3b-4bit-fused' ||
      normalized.includes('cevin-3b') ||
      normalized.includes('qwen2.5-3b')
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
  serverEnv: [
    'CEVIN_MLX_3B_PATH=./cevin-3b-4bit-fused',
    'CEVIN_MLX_MODEL_PATH=./cevin-3b-4bit-fused',
  ],
};

/**
 * Fallback profile for any other local model configured by the user.
 */
export const genericProfile: ModelProfile = {
  id: 'generic',
  label: 'Generic Local Model',
  estimatedMemoryGb: 2.0,
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
  qwen25_1_5bMlxProfile,
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
