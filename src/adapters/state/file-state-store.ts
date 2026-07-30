import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Snapshot } from "../../domain/diff.js";
import type { StateStorePort } from "../../ports/state-store.js";

/**
 * Snapshots are plain JSON — counts, strings, booleans and activity entries — so no date or class
 * revival is needed on read. Keeping them that way is why this store is a dozen lines and why the
 * Azure Table variant will be too.
 */
export function createFileStateStore(path: string): StateStorePort {
  let cache: Record<string, Snapshot> | undefined;

  async function load(): Promise<Record<string, Snapshot>> {
    if (cache !== undefined) return cache;
    try {
      cache = JSON.parse(await readFile(path, "utf8")) as Record<string, Snapshot>;
    } catch {
      cache = {};
    }
    return cache;
  }

  return {
    async get(key) {
      return (await load())[key] ?? null;
    },
    async set(key, snapshot) {
      const data = await load();
      data[key] = snapshot;
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(data, null, 2));
    },
  };
}
