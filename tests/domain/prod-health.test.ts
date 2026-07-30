import { describe, expect, test } from "vitest";
import { reduceProdHealth } from "../../src/domain/surfaces/prod-health.js";
import { signal } from "../support/signals.js";

describe("reduceProdHealth", () => {
  // Lit means "something is wrong" — the opposite polarity from the availability surface, where
  // lit means "come talk to me". Same switch, opposite meaning, so the description matters.
  test("lights up when the latest prod build failed", () => {
    const state = reduceProdHealth([
      signal("build", { source: "azdo-builds", state: "failed", environment: "prod", title: "api" }),
    ]);

    expect(state.on).toBe(true);
    expect(state.description).toBe("Produção quebrada: api");
  });

  test("stays dark when only develop is broken", () => {
    const state = reduceProdHealth([
      signal("build", { source: "azdo-builds", state: "failed", environment: "develop" }),
    ]);

    expect(state.on).toBe(false);
  });

  test("stays dark when everything is green", () => {
    const state = reduceProdHealth([
      signal("build", { source: "azdo-builds", state: "succeeded", environment: "prod" }),
    ]);

    expect(state.on).toBe(false);
    expect(state.description).toBe("Produção saudável");
  });

  test("names how many pipelines are down when several are", () => {
    const state = reduceProdHealth([
      signal("build", { source: "azdo-builds", state: "failed", environment: "prod", title: "api" }),
      signal("build", { source: "azdo-builds", state: "failed", environment: "prod", title: "web" }),
    ]);

    expect(state.description).toBe("Produção quebrada: api, web");
  });

  // With no pipeline integration configured this surface has nothing to say, and must not
  // claim production is healthy.
  test("says it does not know when there are no builds at all", () => {
    const state = reduceProdHealth([signal("review_requested")]);

    expect(state.on).toBe(false);
    expect(state.description).toBe("Sem dados de pipeline");
  });
});
