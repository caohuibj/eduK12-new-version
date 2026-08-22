/**
 * Cognitive Feature Flag.
 *
 * `cognitiveBuildEnabled` is the Vite build-time switch
 * (`VITE_COGNITIVE_MODULE_ENABLED`). A legacy-only bundle can set it to false.
 *
 * Runtime menus and routes must use `useCognitiveEnabled()` so GET /api/capabilities
 * (the backend `COGNITIVE_MODULE_ENABLED` flag) is the source of truth.
 */
export const cognitiveBuildEnabled = import.meta.env.VITE_COGNITIVE_MODULE_ENABLED === 'true'

/** Build-time fallback only. Prefer `useCognitiveEnabled()` in UI. */
export const cognitiveModuleEnabled = cognitiveBuildEnabled
