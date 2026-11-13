import {
  LlmProviderCatalog,
  LlmProviderDescriptor,
} from '../../../core/application';
import { mlxFastApiProviderDescriptor } from './mlxFastApi';
import { mockProviderDescriptor } from './mock';

/**
 * Registry of LLM provider descriptors.
 * `mlx-fastapi` (Cevin model on this Mac) is the default inference backend,
 * with `mock` for Demo mode.
 */
const REGISTERED_PROVIDERS: LlmProviderDescriptor[] = [
  mlxFastApiProviderDescriptor as unknown as LlmProviderDescriptor,
  mockProviderDescriptor as unknown as LlmProviderDescriptor,
];

export function createLlmProviderCatalog(): LlmProviderCatalog {
  return {
    list() {
      return [...REGISTERED_PROVIDERS];
    },
    getById(id: string) {
      if (id === 'cevin-3b-mlx') {
        return REGISTERED_PROVIDERS.find((p) => p.id === 'mlx-fastapi');
      }
      return REGISTERED_PROVIDERS.find((p) => p.id === id);
    },
  };
}
