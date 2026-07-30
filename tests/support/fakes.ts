import type { Command, Snapshot } from "../../src/domain/diff.js";
import type { Signal, SourceId } from "../../src/domain/signal.js";
import type { SignalSourcePort } from "../../src/ports/signal-source.js";
import type { PingInfo, SmartObjectPort } from "../../src/ports/smart-object.js";
import type { StateStorePort } from "../../src/ports/state-store.js";

/** Records what would have gone over the wire, so tests never touch the real space. */
export class FakeSmartObject implements SmartObjectPort {
  readonly applied: Command[] = [];
  applyCalls = 0;

  constructor(readonly name: string) {}

  async apply(commands: readonly Command[]): Promise<void> {
    this.applyCalls += 1;
    this.applied.push(...commands);
  }

  async ping(): Promise<PingInfo> {
    return { preset: "inbox", capabilities: {} };
  }
}

export class FakeSource implements SignalSourcePort {
  constructor(
    readonly id: SourceId,
    private readonly signals: Signal[],
    private readonly failure?: Error,
  ) {}

  async collect(): Promise<Signal[]> {
    if (this.failure !== undefined) throw this.failure;
    return this.signals;
  }
}

export class InMemoryStateStore implements StateStorePort {
  private readonly data = new Map<string, Snapshot>();

  async get(key: string): Promise<Snapshot | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, snapshot: Snapshot): Promise<void> {
    this.data.set(key, snapshot);
  }
}
