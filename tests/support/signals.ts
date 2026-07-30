import type { Signal, SignalKind } from "../../src/domain/signal.js";

let seq = 0;

/** Builds a Signal with sane defaults so each test states only what it cares about. */
export function signal(kind: SignalKind, overrides: Partial<Signal> = {}): Signal {
  seq += 1;
  return {
    id: `test:${seq}`,
    source: "azdo-prs",
    kind,
    title: `signal ${seq}`,
    ...overrides,
  };
}
