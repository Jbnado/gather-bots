import type { Snapshot } from "../domain/diff.js";
import type { Signal } from "../domain/signal.js";
import { reduceInbox } from "../domain/surfaces/inbox.js";
import { reduceLightbulb } from "../domain/surfaces/lightbulb.js";
import { reduceProdHealth } from "../domain/surfaces/prod-health.js";
import { reduceStatus } from "../domain/surfaces/status.js";

/** The Gather presets we know how to drive. `webhook.ping` reports which one an object is. */
export type Preset = "inbox" | "status" | "switch" | "counter";

/**
 * One way of reading the signals onto an object. Pure: same signals and time in, same snapshot
 * out, no network. That is what makes every surface testable in a few lines.
 *
 * To add your own, write the reducer, add an entry here, and point an object at it with the
 * matching `*_SURFACE` variable.
 */
export type SurfaceDefinition = {
  id: string;
  label: string;
  /** The preset an object must be for this surface to make sense. Checked at startup. */
  preset: Preset;
  snapshotOf(signals: readonly Signal[], now: Date): Snapshot;
};

export const SURFACES: readonly SurfaceDefinition[] = [
  {
    id: "inbox",
    label: "what is waiting on me",
    preset: "inbox",
    snapshotOf: (signals) => {
      const state = reduceInbox(signals);
      return { count: state.count, activity: state.activity };
    },
  },
  {
    id: "activity-monitor",
    label: "what is running without me",
    preset: "status",
    snapshotOf: (signals, now) => {
      const state = reduceStatus(signals, now);
      return { status: state.state, activity: state.activity };
    },
  },
  {
    id: "availability",
    label: "lit when you can be interrupted",
    preset: "switch",
    snapshotOf: (signals, now) => {
      const state = reduceLightbulb(signals, now);
      return { on: state.on, description: state.description };
    },
  },
  {
    id: "prod-health",
    label: "lit when production is broken",
    preset: "switch",
    snapshotOf: (signals) => {
      const state = reduceProdHealth(signals);
      return { on: state.on, description: state.description };
    },
  },
];

/**
 * A place on the desk an object can be plugged into. Slots are named after the Gather objects
 * people actually place, so the variable names match what they are looking at.
 */
export type ObjectSlot = {
  key: string;
  label: string;
  urlVar: string;
  secretVar: string;
  /** Lets one slot show a different surface — the lightbulb is the obvious case. */
  surfaceVar: string;
  defaultSurface: string;
};

export const OBJECT_SLOTS: readonly ObjectSlot[] = [
  {
    key: "inbox",
    label: "Inbox",
    urlVar: "GATHER_INBOX_URL",
    secretVar: "GATHER_INBOX_SECRET",
    surfaceVar: "GATHER_INBOX_SURFACE",
    defaultSurface: "inbox",
  },
  {
    key: "status",
    label: "Bot Status Monitor",
    urlVar: "GATHER_STATUS_URL",
    secretVar: "GATHER_STATUS_SECRET",
    surfaceVar: "GATHER_STATUS_SURFACE",
    defaultSurface: "activity-monitor",
  },
  {
    key: "lightbulb",
    label: "Lightbulb",
    urlVar: "GATHER_LIGHTBULB_URL",
    secretVar: "GATHER_LIGHTBULB_SECRET",
    surfaceVar: "GATHER_LIGHTBULB_SURFACE",
    defaultSurface: "availability",
  },
];

export function findSurface(id: string): SurfaceDefinition | undefined {
  return SURFACES.find((surface) => surface.id === id);
}
