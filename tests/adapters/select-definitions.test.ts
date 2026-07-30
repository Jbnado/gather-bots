import { describe, expect, test } from "vitest";
import { selectDefinitions } from "../../src/adapters/azdo/select-definitions.js";

const defs = [
  { id: 1, name: "rpa-front" },
  { id: 2, name: "rpa-api-commom" },
  { id: 3, name: "rpa-cds" },
  { id: 4, name: "Infra.Docker" },
];

describe("selectDefinitions", () => {
  test("takes everything when neither filter is set", () => {
    expect(selectDefinitions(defs, {}).map((d) => d.name)).toEqual([
      "rpa-front",
      "rpa-api-commom",
      "rpa-cds",
      "Infra.Docker",
    ]);
  });

  test("keeps only what match allows", () => {
    expect(selectDefinitions(defs, { match: "^rpa-" }).map((d) => d.name)).toEqual([
      "rpa-front",
      "rpa-api-commom",
      "rpa-cds",
    ]);
  });

  test("drops what exclude names", () => {
    expect(selectDefinitions(defs, { exclude: "^rpa-cds$" }).map((d) => d.name)).toEqual([
      "rpa-front",
      "rpa-api-commom",
      "Infra.Docker",
    ]);
  });

  // The common shape: a family of pipelines minus the one nobody wants to hear about.
  test("applies exclude on top of match", () => {
    const selected = selectDefinitions(defs, { match: "^rpa-", exclude: "cds" });

    expect(selected.map((d) => d.name)).toEqual(["rpa-front", "rpa-api-commom"]);
  });

  // Exclude has the final say, so a pipeline listed in both is dropped rather than kept — the
  // safer reading of a contradictory config is the quieter one.
  test("lets exclude win when both match the same pipeline", () => {
    expect(selectDefinitions(defs, { match: "rpa-cds", exclude: "rpa-cds" })).toEqual([]);
  });

  test("ignores case, since pipeline names are not typed consistently", () => {
    expect(selectDefinitions(defs, { exclude: "INFRA" }).map((d) => d.name)).not.toContain(
      "Infra.Docker",
    );
  });
});
