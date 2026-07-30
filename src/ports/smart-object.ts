import type { Command } from "../domain/diff.js";

export type PingInfo = {
  preset: string | null;
  capabilities: Record<string, unknown>;
};

/**
 * One Gather object, as the core sees it. The core never learns about HTTP, signing or the SDK.
 * A fake implementation lets the dispatcher be tested without touching the real space.
 */
export type SmartObjectPort = {
  /** Label used in logs and errors, e.g. "inbox". */
  readonly name: string;
  apply(commands: readonly Command[]): Promise<void>;
  ping(): Promise<PingInfo>;
};
