import type { Env } from "./registry.js";

/**
 * Reads a variable the registry already guaranteed is present. If this throws, the integration's
 * `env` declaration disagrees with what `create` actually reads — a bug in the integration, not
 * in the user's configuration.
 */
export function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} missing — declare it as required in the integration's env list`);
  }
  return value;
}

export function optional(env: Env, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}
