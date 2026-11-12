import {
  LlmProviderCatalog,
  LlmProviderDescriptor,
} from '../../../core/application';
import { mlxFastApiProviderDescriptor } from './mlxFastApi';
import { mockProviderDescriptor } from './mock';
import {
  ollamaLlama31ProviderDescriptor,
  ollamaProviderDescriptor,
} from './ollama';

/**
 * Registry of LLM provider descriptors.
 * `cevin-3b-mlx` (Cevin 3B Fine-Tuned — MLX FastAPI) is the primary default inference backend,
 * with `ollama-llama3.1` (`ollama` alias) retained as the legacy fallback and `mock` for demo mode.
 */
const REGISTERED_PROVIDERS: LlmProviderDescriptor[] = [
  mlxFastApiProviderDescriptor as unknown as LlmProviderDescriptor,
  ollamaLlama31ProviderDescriptor as unknown as LlmProviderDescriptor,
  ollamaProviderDescriptor as unknown as LlmProviderDescriptor,
  mockProviderDescriptor as unknown as LlmProviderDescriptor,
];

export function createLlmProviderCatalog(): LlmProviderCatalog {
  return {
    list() {
      return [...REGISTERED_PROVIDERS];
    },
    getById(id: string) {
      return REGISTERED_PROVIDERS.find((p) => p.id === id);
    },
  };
}

