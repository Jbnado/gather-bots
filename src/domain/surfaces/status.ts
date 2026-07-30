import { type ActivityItem, truncate } from "../activity.js";
import type { Signal, SignalKind } from "../signal.js";

/**
 * The domain owns this union rather than importing the SDK's — the adapter maps between them.
 * It happens to match `StatusSetDataState` today; that is the adapter's problem, not the core's.
 */
export type StatusLevel = "off" | "on" | "question" | "alert" | "working";

/** Kinds that happen without the human. Everything else belongs on another surface. */
const RUNS_WITHOUT_ME: ReadonlySet<SignalKind> = new Set<SignalKind>([
  "build",
  "release",
  "calendar_event",
]);

/** A meeting starting this soon is worth a heads-up. */
const HEADS_UP_MS = 10 * 60_000;

export type StatusState = {
  state: StatusLevel;
  activity: ActivityItem[];
};

function isHappeningNow(signal: Signal, now: Date): boolean {
  const w = signal.window;
  return w !== undefined && w.start <= now && w.end > now;
}

function isUpcoming(signal: Signal, now: Date): boolean {
  const w = signal.window;
  return w !== undefined && w.start > now;
}

function overlaps(a: Signal, b: Signal): boolean {
  const wa = a.window;
  const wb = b.window;
  return wa !== undefined && wb !== undefined && wa.start < wb.end && wb.start < wa.end;
}

/** Any two still-relevant events sharing a minute means the human is double-booked. */
function hasConflict(events: readonly Signal[], now: Date): boolean {
  const live = events.filter((e) => e.window !== undefined && e.window.end > now);
  return live.some((a, i) => live.slice(i + 1).some((b) => overlaps(a, b)));
}

/**
 * Feed order: what needs attention first. Independent of the precedence ladder, because the
 * icon shows one winner while the feed has to show everyone.
 */
function rank(signal: Signal, now: Date): number {
  if (signal.state === "failed") return 0;
  if (signal.state === "running") return 1;
  if (isHappeningNow(signal, now)) return 2;
  if (isUpcoming(signal, now)) return 3;
  return 4;
}

export function reduceStatus(signals: readonly Signal[], now: Date): StatusState {
  const relevant = signals.filter((s) => RUNS_WITHOUT_ME.has(s.kind));
  const events = relevant.filter((s) => s.kind === "calendar_event");

  // Green pipelines still count towards the level, but listing every one of them would bury the
  // handful of entries that actually need reading.
  const activity = relevant
    .filter((s) => s.state !== "succeeded")
    .sort((a, b) => rank(a, now) - rank(b, now))
    .map((s) => ({
      id: s.id,
      text: truncate(s.title),
      ...(s.url === undefined ? {} : { url: s.url }),
    }));

  return { state: level(relevant, events, now), activity };
}

/**
 * First match wins; the loser stays in the feed.
 *
 * Failures sit above transient states on purpose: a red pipeline must not be hidden by "in a
 * meeting", which resolves on its own while a broken build does not. A failure with no declared
 * environment counts as prod — the noisy direction is the safe one.
 */
function level(relevant: readonly Signal[], events: readonly Signal[], now: Date): StatusLevel {
  if (relevant.length === 0) return "off";

  const failed = relevant.filter((s) => s.state === "failed");

  if (failed.some((s) => s.environment !== "develop") || hasConflict(events, now)) return "alert";
  if (failed.length > 0) return "question";

  if (relevant.some((s) => s.state === "running") || events.some((e) => isHappeningNow(e, now))) {
    return "working";
  }

  const soon = events.some((e) => {
    const start = e.window?.start;
    return start !== undefined && start > now && start.getTime() - now.getTime() <= HEADS_UP_MS;
  });
  if (soon) return "question";

  return "on";
}
