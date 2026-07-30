import type { Snapshot } from "../domain/diff.js";

/**
 * Remembers what was last written to each object. Without it every tick would resend the whole
 * state and burn the space-wide rate limit.
 */
export type StateStorePort = {
  get(key: string): Promise<Snapshot | null>;
  set(key: string, snapshot: Snapshot): Promise<void>;
};
