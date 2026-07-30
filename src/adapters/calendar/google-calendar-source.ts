import type { Signal } from "../../domain/signal.js";
import type { SignalSourcePort } from "../../ports/signal-source.js";
import { type GoogleEvent, toCalendarSignals } from "./map-google-events.js";

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** How far ahead to look. The surfaces only care about today. */
  lookaheadHours?: number;
};

export function createGoogleCalendarSource(config: GoogleCalendarConfig): SignalSourcePort {
  let accessToken: string | undefined;
  let expiresAt = 0;

  /** Refreshed lazily and reused; Google's access tokens last an hour. */
  async function token(): Promise<string> {
    if (accessToken !== undefined && Date.now() < expiresAt - 60_000) return accessToken;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || body.access_token === undefined) {
      throw new Error(`google token refresh failed (${res.status}) — re-run pnpm authorize:google`);
    }

    accessToken = body.access_token;
    expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    return accessToken;
  }

  return {
    id: "gcal",
    async collect(now: Date): Promise<Signal[]> {
      const lookahead = (config.lookaheadHours ?? 12) * 3_600_000;

      const url =
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
        new URLSearchParams({
          // A meeting that started before now but has not ended still counts as "in a meeting".
          timeMin: new Date(now.getTime() - 4 * 3_600_000).toISOString(),
          timeMax: new Date(now.getTime() + lookahead).toISOString(),
          // Expands recurring series into concrete instances; without it a weekly meeting arrives
          // as one rule with no usable window.
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "50",
        });

      const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
      if (!res.ok) throw new Error(`google calendar ${res.status}`);

      const body = (await res.json()) as { items?: GoogleEvent[] };
      return toCalendarSignals(body.items ?? []);
    },
  };
}
