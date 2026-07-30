import type { SignalSourcePort } from "../ports/signal-source.js";

export type Env = Record<string, string | undefined>;

export type EnvVar = {
  name: string;
  required: boolean;
  /** Shown by `pnpm checkup` when the variable is missing. Say what it is and where to get it. */
  describe: string;
};

/**
 * One upstream system, described well enough that the app can decide whether it is configured
 * without knowing anything about what it does.
 *
 * To add your own: implement `SignalSourcePort`, export an `Integration` describing it, and add
 * it to the list in `./index.ts`. Nothing in `src/domain` needs to change.
 */
export type Integration = {
  /** Stable, kebab-case. Appears in `pnpm checkup` output and in logs. */
  id: string;
  label: string;
  /** Path to the setup guide, printed next to the integration when it is not configured. */
  docs: string;
  env: EnvVar[];
  create(env: Env): SignalSourcePort;
  /**
   * Optional lifecycle hook for *push* integrations — anything that has to listen rather than
   * ask. Called once at startup and only when the integration is enabled; returns the function
   * that shuts it down again.
   *
   * Polling integrations leave this out: `create` alone is their whole contract.
   */
  start?(env: Env): Promise<() => Promise<void>>;
};

export type IntegrationStatus =
  | { id: string; label: string; docs: string; enabled: true; integration: Integration }
  | { id: string; label: string; docs: string; enabled: false; missing: string[] };

/** `FOO=` in a copied .env.example is present but useless, so blank counts as missing. */
function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Decides which integrations are switched on. Missing configuration is never an error — an
 * integration nobody set up simply stays off, and says which variable would turn it on.
 */
export function resolveIntegrations(
  registry: readonly Integration[],
  env: Env,
): IntegrationStatus[] {
  return registry.map((integration) => {
    const missing = integration.env
      .filter((variable) => variable.required && isBlank(env[variable.name]))
      .map((variable) => variable.name);

    const common = { id: integration.id, label: integration.label, docs: integration.docs };

    return missing.length === 0
      ? { ...common, enabled: true as const, integration }
      : { ...common, enabled: false as const, missing };
  });
}
