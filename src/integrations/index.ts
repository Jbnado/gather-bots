import {
  azureDevOpsBuilds,
  azureDevOpsPullRequests,
  azureDevOpsWorkItems,
} from "./azure-devops.js";
import { googleCalendar, outlookCalendar } from "./calendars.js";
import type { Integration } from "./registry.js";

/**
 * Every integration the app knows about. Order only affects the order they appear in
 * `pnpm checkup`; anything not configured simply stays off.
 *
 * ## Adding your own
 *
 * 1. Write something that implements `SignalSourcePort` — one method, `collect(now)`, returning
 *    `Signal[]`. Keep the shaping of upstream JSON into `Signal` in a separate pure function so
 *    it can be tested without the network.
 * 2. Export an `Integration` describing it: an id, a label, where its setup guide lives, and
 *    which environment variables it needs.
 * 3. Add it to this array.
 *
 * That is the whole contract. Nothing under `src/domain` changes, and you never touch the
 * dispatcher, the diff, or anything Gather-specific.
 */
export const INTEGRATIONS: readonly Integration[] = [
  azureDevOpsPullRequests,
  azureDevOpsWorkItems,
  azureDevOpsBuilds,
  googleCalendar,
  outlookCalendar,
];

export { type Env, type Integration, type IntegrationStatus, resolveIntegrations } from "./registry.js";
