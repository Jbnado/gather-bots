import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type OutlookEvent, toOutlookSignals } from "./map-outlook-events.js";

export type OutlookConfig = {
  tenantId: string;
  clientId: string;
  refreshToken: string;
  lookaheadHours?: number;
};

export function createOutlookCalendarSource(config: OutlookConfig): SignalSourcePort {
  let accessToken: string | undefined;
  let expiresAt = 0;

  async function token(): Promise<string> {
    if (accessToken !== undefined && Date.now() < expiresAt - 60_000) return accessToken;

    const res = await fetch(
      `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
          scope: "Calendars.Read offline_access",
        }),
      },
    );

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || body.access_token === undefined) {
      throw new Error(`microsoft token refresh failed (${res.status}) — re-run pnpm authorize:outlook`);
    }

    accessToken = body.access_token;
    expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    return accessToken;
  }

  return {
    id: "outlook",
    async collect(now: Date): Promise<Signal[]> {
      const lookahead = (config.lookaheadHours ?? 12) * 3_600_000;

      const url =
        "https://graph.microsoft.com/v1.0/me/calendarView?" +
        new URLSearchParams({
          // calendarView (not /events) expands recurring series into concrete instances.
          startDateTime: new Date(now.getTime() - 4 * 3_600_000).toISOString(),
          endDateTime: new Date(now.getTime() + lookahead).toISOString(),
          $select: "id,subject,isCancelled,isAllDay,showAs,webLink,start,end,responseStatus",
          $orderby: "start/dateTime",
          $top: "50",
        });

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${await token()}`,
          // Without this Graph answers in the mailbox's own zone, and the timestamps carry no
          // offset — asking for UTC is what makes them unambiguous.
          Prefer: 'outlook.timezone="UTC"',
        },
      });
      if (!res.ok) throw new Error(`microsoft graph ${res.status}`);

      const body = (await res.json()) as { value?: OutlookEvent[] };
      return toOutlookSignals(body.value ?? []);
    },
  };
}
