/**
 * Feature flags – controlados por variáveis de ambiente.
 * Valor padrão: true (ativado). Para desativar, defina a variável como "false".
 */
export const ENABLE_TTS = process.env.ENABLE_TTS !== "false";
export const ENABLE_WORLD_EXTRACTION = process.env.ENABLE_WORLD_EXTRACTION !== "false";
export const ENABLE_AI = process.env.ENABLE_AI !== "false";
export const ENABLE_EXPERIMENTAL_FEATURES = process.env.ENABLE_EXPERIMENTAL_FEATURES === "true"; // explicit opt‑in
export const ENABLE_BLOCK_AUDIO = process.env.ENABLE_BLOCK_AUDIO === "true";
