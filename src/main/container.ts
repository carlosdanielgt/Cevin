import {
  createExporterCatalog,
  createTemplateCatalog,
} from '../adapters/driven/exporters';
import { createImporterCatalog } from '../adapters/driven/importers';
import {
  createLlmProviderCatalog,
  createModelProfileCatalog,
} from '../adapters/driven/llm';
import {
  createDexieRepositories,
  createInMemoryRepositories,
} from '../adapters/driven/storage';
import { CevinUseCases, createCevinUseCases } from '../core/application';

export interface ContainerOptions {
  inMemoryOnly?: boolean;
  seedDemo?: boolean;
}

/**
 * Hexagonal Composition Root.
 * `main/` is the ONLY layer that imports both driven adapters and core application use cases,
 * wiring them together and providing the container to the driving React web adapter.
 */
export function buildCevinContainer(
  options?: ContainerOptions,
): CevinUseCases {
  const {
    bankRepo,
    appRepo,
    settingsRepo,
    prefsRepo,
    resultCache,
    performanceLog,
  } = options?.inMemoryOnly
    ? createInMemoryRepositories(options.seedDemo ?? true)
    : createDexieRepositories();

  const importerCatalog = createImporterCatalog();
  const exporterCatalog = createExporterCatalog();
  const templateCatalog = createTemplateCatalog();
  const llmCatalog = createLlmProviderCatalog();
  const modelProfileCatalog = createModelProfileCatalog();

  let seq = 100;
  return createCevinUseCases({
    bankRepo,
    appRepo,
    settingsRepo,
    prefsRepo,
    importerCatalog,
    exporterCatalog,
    templateCatalog,
    llmCatalog,
    modelProfileCatalog,
    resultCache,
    performanceLog,
    clock: {
      nowIso: () => new Date().toISOString(),
    },
    idGen: {
      nextId: (prefix = 'id') => `${prefix}-${Date.now()}-${seq++}`,
    },
  });
}
