import { spawn } from "node:child_process";

/**
 * Best-effort browser launch for the OAuth flows. Every caller also prints the URL, so failing
 * here is not fatal — a headless server or an unusual desktop just means copying the link.
 */
export function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    const child = spawn(command as string, args as string[], {
      detached: true,
      stdio: "ignore",
    });
    // Without this an unavailable command (common over SSH) crashes the process instead of
    // letting the printed URL do its job.
    child.on("error", () => undefined);
    child.unref();
  } catch {
    /* the URL is printed by the caller */
  }
}
