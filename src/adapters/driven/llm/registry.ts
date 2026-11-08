import {
  LlmProviderCatalog,
  LlmProviderDescriptor,
} from '../../../core/application';
import { mockProviderDescriptor } from './mock';
import { ollamaProviderDescriptor } from './ollama';

/**
 * Registry of LLM provider descriptors.
 * Extension point: add a new LLM provider by creating its adapter and adding 1 line below.
 */
const REGISTERED_PROVIDERS: LlmProviderDescriptor[] = [
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
