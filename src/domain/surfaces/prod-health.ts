import type { Signal } from "../signal.js";
import type { LightbulbState } from "./lightbulb.js";

/**
 * A switch showing whether production is broken. Lit means something is wrong.
 *
 * Note the polarity is the opposite of the availability surface, where lit means "come talk to
 * me". Same object type, opposite meaning — which is exactly why the reason goes into
 * `info.description`, so nobody has to remember which convention a given desk uses.
 */
export function reduceProdHealth(signals: readonly Signal[]): LightbulbState {
  // An uptime monitor and a pipeline are both evidence about production, so both count here.
  const evidence = signals.filter(
    (s) => s.kind === "build" || s.kind === "release" || s.kind === "incident",
  );

  // Never claim production is healthy on the strength of no evidence.
  if (evidence.length === 0) return { on: false, description: "Sem dados de pipeline" };

  const broken = evidence.filter((s) => s.state === "failed" && s.environment === "prod");

  if (broken.length === 0) return { on: false, description: "Produção saudável" };

  return {
    on: true,
    description: `Produção quebrada: ${broken.map((s) => s.title).join(", ")}`,
  };
}
