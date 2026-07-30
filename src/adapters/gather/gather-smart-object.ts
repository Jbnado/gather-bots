import { createWebhookObjectClient, secretFromEnv } from "@gathertown/webhook-object-sdk";
import type { Command } from "../../domain/diff.js";
import type { PingInfo, SmartObjectPort } from "../../ports/smart-object.js";

type Client = ReturnType<typeof createWebhookObjectClient>;

/**
 * Exhaustive by construction: adding a Command variant without handling it here is a compile
 * error, so the wire mapping can never silently drop an event type.
 */
function send(client: Client, command: Command): Promise<unknown> {
  switch (command.type) {
    case "info.set":
      return client.send("info.set", command.data);
    case "counter.set":
      return client.send("counter.set", command.data);
    case "status.set":
      return client.send("status.set", command.data);
    case "switch.set_state":
      return client.send("switch.set_state", command.data);
    case "activity.add":
      return client.send("activity.add", command.data);
    case "activity.remove":
      return client.send("activity.remove", command.data);
  }
}

export function createGatherSmartObject(
  name: string,
  urlVar: string,
  secretVar: string,
): SmartObjectPort {
  const url = process.env[urlVar];
  if (url === undefined || url === "") {
    throw new Error(`${urlVar} is empty — copy it from the object's ⋮ menu in Gather`);
  }
  const client = createWebhookObjectClient({ url, secret: secretFromEnv(secretVar) });

  return {
    name,
    async apply(commands) {
      // Sequential on purpose: the rate limit is space-wide, so parallel bursts across three
      // objects would compete with each other for the same budget.
      for (const command of commands) {
        await send(client, command);
      }
    },
    async ping(): Promise<PingInfo> {
      const pong = await client.ping();
      return { preset: pong.preset, capabilities: pong.capabilities };
    },
  };
}
