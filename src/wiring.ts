import { createGatherSmartObject } from "./adapters/gather/gather-smart-object.js";
import { withLastKnownGood } from "./domain/last-known-good.js";
import type { SurfaceTarget } from "./domain/refresh.js";
import { INTEGRATIONS, type Env, type Integration, resolveIntegrations } from "./integrations/index.js";
import { findSurface, OBJECT_SLOTS } from "./objects/registry.js";
import type { SignalSourcePort } from "./ports/signal-source.js";

/** A source is allowed to be down for this long before its items disappear from the objects. */
const STALE_AFTER_MS = 15 * 60_000;

export type ObjectStatus =
  | { key: string; label: string; state: "off"; reason: string }
  | { key: string; label: string; state: "broken"; reason: string }
  | {
      key: string;
      label: string;
      state: "on";
      preset: string;
      surface: string;
      name: string | undefined;
      target: SurfaceTarget;
    };

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * Works out which objects are usable, by asking Gather rather than trusting configuration.
 *
 * Three outcomes, and the difference matters: **off** is a slot nobody filled in, which is the
 * normal state for a desk with one object on it. **broken** is a slot that was filled in and does
 * not work — the only one worth anyone's attention. **on** is ready to drive.
 */
export async function resolveObjects(env: Env): Promise<ObjectStatus[]> {
  const resolved: ObjectStatus[] = [];

  for (const slot of OBJECT_SLOTS) {
    const common = { key: slot.key, label: slot.label };

    if (isBlank(env[slot.urlVar]) || isBlank(env[slot.secretVar])) {
      resolved.push({
        ...common,
        state: "off",
        reason: `set ${slot.urlVar} and ${slot.secretVar}`,
      });
      continue;
    }

    const surfaceId = isBlank(env[slot.surfaceVar])
      ? slot.defaultSurface
      : (env[slot.surfaceVar] as string).trim();
    const surface = findSurface(surfaceId);

    if (surface === undefined) {
      resolved.push({
        ...common,
        state: "broken",
        reason: `${slot.surfaceVar}="${surfaceId}" is not a known surface`,
      });
      continue;
    }

    try {
      const object = createGatherSmartObject(slot.key, slot.urlVar, slot.secretVar);
      const pong = await object.ping();

      // Catching this here turns a mis-pasted URL into one clear line at startup rather than a
      // capability_not_declared error on every tick from now on.
      if (pong.preset !== surface.preset) {
        resolved.push({
          ...common,
          state: "broken",
          reason: `surface "${surface.id}" needs a ${surface.preset} object, this one is ${pong.preset}`,
        });
        continue;
      }

      const info = pong.capabilities["info"] as { name?: string } | undefined;

      resolved.push({
        ...common,
        state: "on",
        preset: String(pong.preset),
        surface: surface.id,
        name: info?.name,
        target: { key: slot.key, object, snapshotOf: surface.snapshotOf },
      });
    } catch (error) {
      const e = error as { code?: string; message?: string };
      resolved.push({ ...common, state: "broken", reason: e.code ?? e.message ?? "unreachable" });
    }
  }

  return resolved;
}

export type SourceStatus =
  | { id: string; label: string; state: "on"; source: SignalSourcePort; integration: Integration }
  | { id: string; label: string; state: "off"; missing: string[]; docs: string }
  | { id: string; label: string; state: "broken"; reason: string; docs: string };

/** Builds the sources whose configuration is complete. Everything else stays off, with a reason. */
export function resolveSources(env: Env): SourceStatus[] {
  return resolveIntegrations(INTEGRATIONS, env).map((status) => {
    if (!status.enabled) {
      return {
        id: status.id,
        label: status.label,
        state: "off" as const,
        missing: status.missing,
        docs: status.docs,
      };
    }

    try {
      return {
        id: status.id,
        label: status.label,
        state: "on" as const,
        integration: status.integration,
        // Wrapping here rather than inside each integration means contributors get outage
        // tolerance without having to think about it.
        source: withLastKnownGood(status.integration.create(env), { maxAgeMs: STALE_AFTER_MS }),
      };
    } catch (error) {
      return {
        id: status.id,
        label: status.label,
        state: "broken" as const,
        reason: (error as Error).message,
        docs: status.docs,
      };
    }
  });
}
