import { describe, expect, test } from "vitest";
import { type AzdoWorkItem, toWorkItemSignals } from "../../src/adapters/azdo/map-work-items.js";

const ORG = "https://dev.azure.com/contoso";

function item(overrides: Partial<AzdoWorkItem["fields"]> = {}, id = 202): AzdoWorkItem {
  return {
    id,
    fields: {
      "System.Title": "Corrigir cálculo de frete",
      "System.State": "Doing",
      "System.WorkItemType": "Bug",
      "System.TeamProject": "Projeto - Gestão de Vendas",
      "System.ChangedDate": "2026-07-28T10:00:00Z",
      ...overrides,
    },
  };
}

describe("toWorkItemSignals", () => {
  test("maps a work item to an assigned signal", () => {
    const [signal] = toWorkItemSignals([item()], { orgUrl: ORG });

    expect(signal?.kind).toBe("work_item_assigned");
    expect(signal?.id).toBe("wi:202");
  });

  test("leads the title with the type and state so the feed reads at a glance", () => {
    const [signal] = toWorkItemSignals([item()], { orgUrl: ORG });

    expect(signal?.title).toBe("Bug · Doing · Corrigir cálculo de frete");
  });

  test("builds a browser URL with the project encoded", () => {
    const [signal] = toWorkItemSignals(
      [item({ "System.TeamProject": "Automação de Dados" })],
      { orgUrl: ORG },
    );

    expect(signal?.url).toBe(
      "https://dev.azure.com/contoso/Automa%C3%A7%C3%A3o%20de%20Dados/_workitems/edit/202",
    );
  });

  test("carries the last change date so the feed can sort by age", () => {
    const [signal] = toWorkItemSignals([item()], { orgUrl: ORG });

    expect(signal?.since).toEqual(new Date("2026-07-28T10:00:00Z"));
  });
});
