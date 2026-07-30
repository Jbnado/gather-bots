import type { Signal, SourceId } from "../domain/signal.js";

/** One upstream system, normalised. Sources report facts; surfaces decide presentation. */
export type SignalSourcePort = {
  readonly id: SourceId;
  collect(now: Date): Promise<Signal[]>;
};
