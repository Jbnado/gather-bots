import type { Signal } from "../signal.js";

/** Close enough that starting something new is a bad idea. */
const IMMINENT_MS = 5 * 60_000;

export type LightbulbState = {
  /** true = interruptible. */
  on: boolean;
  /** A switch has no feed, so the reason rides along in `info.set`. */
  description: string;
};

/** A calendar signal that actually carries a time range, so `window` needs no assertion. */
type TimedEvent = Signal & { window: NonNullable<Signal["window"]> };

function meetings(signals: readonly Signal[]): TimedEvent[] {
  return signals.filter(
    (s): s is TimedEvent => s.kind === "calendar_event" && s.window !== undefined,
  );
}

export function reduceLightbulb(signals: readonly Signal[], now: Date): LightbulbState {
  const events = meetings(signals);

  const ongoing = events.find((e) => e.window.start <= now && e.window.end > now);
  if (ongoing !== undefined) {
    return { on: false, description: `Em reunião: ${ongoing.title}` };
  }

  const imminent = events
    .filter((e) => e.window.start > now)
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime())
    .find((e) => e.window.start.getTime() - now.getTime() <= IMMINENT_MS);

  if (imminent !== undefined) {
    const minutes = Math.round((imminent.window.start.getTime() - now.getTime()) / 60_000);
    return { on: false, description: `Reunião em ${minutes} min: ${imminent.title}` };
  }

  return { on: true, description: "Livre" };
}
