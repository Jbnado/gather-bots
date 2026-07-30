import { createAzdoBuildsSource, parseBuildScope } from "../adapters/azdo/azdo-builds-source.js";
import { createAzdoSource } from "../adapters/azdo/azdo-source.js";
import {
  createAzdoWorkItemsSource,
  parseTeam,
} from "../adapters/azdo/azdo-work-items-source.js";
import { optional, required } from "./env.js";
import type { Integration } from "./registry.js";

const DOCS = "docs/integrations/azure-devops.md";

const ORG = {
  name: "AZDO_ORG_URL",
  required: true,
  describe: "e.g. https://dev.azure.com/your-org",
} as const;

const PAT = {
  name: "AZDO_PAT",
  required: true,
  describe: "personal access token, read-only scopes are enough",
} as const;

export const azureDevOpsPullRequests: Integration = {
  id: "azure-devops-prs",
  label: "Azure DevOps — pull requests",
  docs: DOCS,
  env: [
    ORG,
    PAT,
    {
      name: "AZDO_USER_EMAIL",
      required: true,
      describe: "your address in the org, used to tell your PRs from everyone else's",
    },
  ],
  create: (env) =>
    createAzdoSource({
      orgUrl: required(env, "AZDO_ORG_URL"),
      pat: required(env, "AZDO_PAT"),
      myEmail: required(env, "AZDO_USER_EMAIL"),
    }),
};

export const azureDevOpsWorkItems: Integration = {
  id: "azure-devops-work-items",
  label: "Azure DevOps — work items",
  docs: DOCS,
  env: [
    ORG,
    PAT,
    {
      name: "AZDO_WORK_ITEM_STATES",
      required: true,
      describe: 'states that count as yours right now, e.g. "Doing,Rework,To do"',
    },
    {
      name: "AZDO_WORK_ITEM_TEAM",
      required: false,
      describe: 'optional "Project/Team" — scopes the query and unlocks the sprint filter',
    },
    {
      name: "AZDO_WORK_ITEM_CURRENT_SPRINT",
      required: false,
      describe: "set to true to show only the sprint in progress (needs AZDO_WORK_ITEM_TEAM)",
    },
  ],
  create: (env) =>
    createAzdoWorkItemsSource({
      orgUrl: required(env, "AZDO_ORG_URL"),
      pat: required(env, "AZDO_PAT"),
      states: required(env, "AZDO_WORK_ITEM_STATES")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
      team: parseTeam(optional(env, "AZDO_WORK_ITEM_TEAM")),
      currentSprintOnly: optional(env, "AZDO_WORK_ITEM_CURRENT_SPRINT")?.toLowerCase() === "true",
    }),
};

export const azureDevOpsBuilds: Integration = {
  id: "azure-devops-builds",
  label: "Azure DevOps — pipelines",
  docs: DOCS,
  env: [
    ORG,
    PAT,
    {
      name: "AZDO_BUILD_SCOPE",
      required: true,
      describe: 'JSON array of watched projects, e.g. [{"project":"Web","match":"^api-"}]',
    },
  ],
  create: (env) =>
    createAzdoBuildsSource({
      orgUrl: required(env, "AZDO_ORG_URL"),
      pat: required(env, "AZDO_PAT"),
      scope: parseBuildScope(required(env, "AZDO_BUILD_SCOPE")),
    }),
};
