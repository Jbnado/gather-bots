import { describe, expect, test } from "vitest";
import { buildWorkItemQuery } from "../../src/adapters/azdo/work-item-query.js";

describe("buildWorkItemQuery", () => {
  test("filters by assignee and the chosen states", () => {
    const query = buildWorkItemQuery({ states: ["Doing", "To do"], currentSprintOnly: false });

    expect(query).toContain("[System.AssignedTo] = @Me");
    expect(query).toContain(`[System.State] IN ('Doing','To do')`);
  });

  test("leaves the iteration alone by default", () => {
    const query = buildWorkItemQuery({ states: ["Doing"], currentSprintOnly: false });

    expect(query).not.toContain("@CurrentIteration");
  });

  test("narrows to the current sprint when asked", () => {
    const query = buildWorkItemQuery({ states: ["Doing"], currentSprintOnly: true });

    expect(query).toContain("[System.IterationPath] UNDER @CurrentIteration");
  });

  // Azure DevOps rejects a single quote inside a WIQL literal, and state names are user-supplied.
  test("escapes a quote in a state name", () => {
    const query = buildWorkItemQuery({ states: ["Client's review"], currentSprintOnly: false });

    expect(query).toContain(`'Client''s review'`);
  });
});
