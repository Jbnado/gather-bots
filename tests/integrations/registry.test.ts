import { describe, expect, test } from "vitest";
import { type Integration, resolveIntegrations } from "../../src/integrations/registry.js";

const jira: Integration = {
  id: "jira",
  label: "Jira",
  docs: "docs/integrations/jira.md",
  env: [
    { name: "JIRA_URL", required: true, describe: "instance URL" },
    { name: "JIRA_TOKEN", required: true, describe: "API token" },
    { name: "JIRA_PROJECT", required: false, describe: "narrow to one project" },
  ],
  create: () => {
    throw new Error("not called in these tests");
  },
};

describe("resolveIntegrations", () => {
  test("enables an integration once every required variable is present", () => {
    const [status] = resolveIntegrations([jira], {
      JIRA_URL: "https://example.atlassian.net",
      JIRA_TOKEN: "t",
    });

    expect(status?.enabled).toBe(true);
  });

  test("disables it and names what is missing", () => {
    const [status] = resolveIntegrations([jira], { JIRA_URL: "https://example.atlassian.net" });

    expect(status?.enabled).toBe(false);
    expect(status?.enabled === false && status.missing).toEqual(["JIRA_TOKEN"]);
  });

  // Copying .env.example leaves `JIRA_TOKEN=` behind, which is present but useless.
  test("treats an empty value as missing", () => {
    const [status] = resolveIntegrations([jira], { JIRA_URL: "https://x", JIRA_TOKEN: "   " });

    expect(status?.enabled).toBe(false);
    expect(status?.enabled === false && status.missing).toEqual(["JIRA_TOKEN"]);
  });

  test("optional variables never hold an integration back", () => {
    const [status] = resolveIntegrations([jira], { JIRA_URL: "https://x", JIRA_TOKEN: "t" });

    expect(status?.enabled).toBe(true);
  });

  // Nothing configured is the normal first-run state, not an error.
  test("reports every integration as disabled when nothing is configured", () => {
    const resolved = resolveIntegrations([jira], {});

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.enabled).toBe(false);
  });
});
