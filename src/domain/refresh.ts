import { diff, type Snapshot } from "./diff.js";
import type { Signal } from "./signal.js";
import type { SignalSourcePort } from "../ports/signal-source.js";
import type { SmartObjectPort } from "../ports/smart-object.js";
import type { StateStorePort } from "../ports/state-store.js";

export type SurfaceTarget = {
  /** Key under which this object's last-written snapshot is stored. */
  key: string;
  object: SmartObjectPort;
  snapshotOf: (signals: readonly Signal[], now: Date) => Snapshot;
};

export type RefreshDeps = {
  sources: readonly SignalSourcePort[];
  targets: readonly SurfaceTarget[];
  store: StateStorePort;
  now: Date;
};

export type RefreshResult = {
  signals: number;
  commands: number;
  /** Ids of sources that failed this tick. Their signals are absent from the result. */
  failed: string[];
};

type Collected = { id: string; signals: Signal[] | undefined };

/**
 * One tick: collect every source, reduce into each object's desired state, send only what changed.
 *
 * Failure handling has two levels, because a partial outage and a total one mean different things.
 *
 * A source that fails is dropped and reported while the others carry on — one badly behaved
 * integration must not freeze every object. Brief blips never reach this point: `withLastKnownGood`
 * serves the previous result for them, so a failure arriving here has already persisted.
 *
 * If *every* source fails, nothing is written. That usually means the network is down rather than
 * every queue emptying at once, and writing would blank all objects simultaneously. The same branch
 * covers a fresh install with nothing configured: no sources means nothing to say, so the objects
 * are left alone instead of being set to zero.
 */
export async function refresh(deps: RefreshDeps): Promise<RefreshResult> {
  const collected: Collected[] = await Promise.all(
    deps.sources.map(async (source) => {
      try {
        return { id: source.id, signals: await source.collect(deps.now) };
      } catch {
        return { id: source.id, signals: undefined };
      }
    }),
  );

  const failed = collected.filter((c) => c.signals === undefined).map((c) => c.id);
  const succeeded = collected.filter(
    (c): c is { id: string; signals: Signal[] } => c.signals !== undefined,
  );

  if (succeeded.length === 0) return { signals: 0, commands: 0, failed };

  const signals = succeeded.flatMap((c) => c.signals);
  let commands = 0;

  for (const target of deps.targets) {
    const next = target.snapshotOf(signals, deps.now);
    const previous = await deps.store.get(target.key);
    const pending = diff(previous, next);

    if (pending.length === 0) continue;

    await target.object.apply(pending);
    await deps.store.set(target.key, next);
    commands += pending.length;
  }

  return { signals: signals.length, commands, failed };
}
