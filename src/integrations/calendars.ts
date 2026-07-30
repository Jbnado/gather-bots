import { createGoogleCalendarSource } from "../adapters/calendar/google-calendar-source.js";
import { createOutlookCalendarSource } from "../adapters/calendar/outlook-calendar-source.js";
import { required } from "./env.js";
import type { Integration } from "./registry.js";

export const googleCalendar: Integration = {
  id: "google-calendar",
  label: "Google Calendar",
  docs: "docs/integrations/google-calendar.md",
  env: [
    { name: "GOOGLE_CLIENT_ID", required: true, describe: "from a Desktop app OAuth client" },
    { name: "GOOGLE_CLIENT_SECRET", required: true, describe: "from the same OAuth client" },
    {
      name: "GOOGLE_REFRESH_TOKEN",
      required: true,
      describe: "printed by `pnpm authorize:google`",
    },
  ],
  create: (env) =>
    createGoogleCalendarSource({
      clientId: required(env, "GOOGLE_CLIENT_ID"),
      clientSecret: required(env, "GOOGLE_CLIENT_SECRET"),
      refreshToken: required(env, "GOOGLE_REFRESH_TOKEN"),
    }),
};

export const outlookCalendar: Integration = {
  id: "outlook-calendar",
  label: "Outlook / Microsoft 365 Calendar",
  docs: "docs/integrations/outlook.md",
  env: [
    { name: "MS_TENANT_ID", required: true, describe: "directory (tenant) id from Entra" },
    { name: "MS_CLIENT_ID", required: true, describe: "application (client) id from Entra" },
    {
      name: "MS_REFRESH_TOKEN",
      required: true,
      describe: "printed by `pnpm authorize:outlook`",
    },
  ],
  create: (env) =>
    createOutlookCalendarSource({
      tenantId: required(env, "MS_TENANT_ID"),
      clientId: required(env, "MS_CLIENT_ID"),
      refreshToken: required(env, "MS_REFRESH_TOKEN"),
    }),
};
