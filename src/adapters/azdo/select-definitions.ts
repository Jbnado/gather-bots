export type DefinitionFilter = {
  /** Regex on the pipeline name. Omit to start from every pipeline in the project. */
  match?: string | undefined;
  /** Regex on the pipeline name. Anything matching is dropped, even if `match` allowed it. */
  exclude?: string | undefined;
};

export type BuildDefinition = { id: number; name: string };

/**
 * Picks which pipelines a project contributes.
 *
 * `exclude` runs last and wins outright: a config that both includes and excludes the same
 * pipeline is contradictory, and the quieter reading is the safer one to act on.
 *
 * Both patterns are case-insensitive, because pipeline names inside one organisation are rarely
 * typed consistently.
 */
export function selectDefinitions(
  definitions: readonly BuildDefinition[],
  filter: DefinitionFilter,
): BuildDefinition[] {
  const include = filter.match === undefined ? undefined : new RegExp(filter.match, "i");
  const drop = filter.exclude === undefined ? undefined : new RegExp(filter.exclude, "i");

  return definitions
    .filter((definition) => include?.test(definition.name) ?? true)
    .filter((definition) => !(drop?.test(definition.name) ?? false));
}
