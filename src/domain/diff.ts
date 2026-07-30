import type { ActivityItem } from "./activity.js";
import type { StatusLevel } from "./surfaces/status.js";

/**
 * One wire event.
 *
 * `activity.clear` is deliberately absent: an object carries entries from several sources, so
 * clearing would wipe the other sources' items. Leaving it out of the union means the compiler
 * refuses the bug rather than a code reviewer having to catch it.
 */
export type Command =
  | { type: "info.set"; data: { name?: string; description?: string } }
  | { type: "counter.set"; data: { count: number } }
  | { type: "status.set"; data: { state: StatusLevel } }
  | { type: "switch.set_state"; data: { on: boolean } }
  | { type: "activity.add"; data: ActivityItem }
  | { type: "activity.remove"; data: { id: string } };

/** What an object should look like. Fields an object's preset can't express stay undefined. */
export type Snapshot = {
  count?: number;
  status?: StatusLevel;
  on?: boolean;
  description?: string;
  activity?: ActivityItem[];
};

function byId(items: readonly ActivityItem[] | undefined): Map<string, ActivityItem> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

/**
 * The commands needed to move an object from `previous` to `next`. A `null` previous means we
 * have never written to this object, so everything is emitted.
 *
 * Steady state returns an empty array — that is what keeps a per-minute poll from consuming the
 * space-wide rate limit.
 */
export function diff(previous: Snapshot | null, next: Snapshot): Command[] {
  const prev = previous ?? {};
  const commands: Command[] = [];

  if (next.description !== undefined && next.description !== prev.description) {
    commands.push({ type: "info.set", data: { description: next.description } });
  }
  if (next.count !== undefined && next.count !== prev.count) {
    commands.push({ type: "counter.set", data: { count: next.count } });
  }
  if (next.status !== undefined && next.status !== prev.status) {
    commands.push({ type: "status.set", data: { state: next.status } });
  }
  if (next.on !== undefined && next.on !== prev.on) {
    commands.push({ type: "switch.set_state", data: { on: next.on } });
  }

  const before = byId(prev.activity);
  const after = byId(next.activity);

  // Removals first, so a feed at its cap never momentarily overshoots.
  for (const id of before.keys()) {
    if (!after.has(id)) commands.push({ type: "activity.remove", data: { id } });
  }

  for (const [id, item] of after) {
    const existing = before.get(id);
    if (existing === undefined || existing.text !== item.text || existing.url !== item.url) {
      commands.push({ type: "activity.add", data: item });
    }
  }

  return commands;
}
