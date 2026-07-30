export type WorkItemQueryOptions = {
  states: readonly string[];
  /**
   * Narrows to the sprint in progress. Only meaningful on a team-scoped request — Azure DevOps
   * answers `VS402612: the macro '@CurrentIteration' is not supported without a team context`
   * for an organisation-wide query, which is why the team is what switches this on.
   */
  currentSprintOnly: boolean;
};

/** WIQL has no parameter binding, and state names come from the user's process template. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildWorkItemQuery(options: WorkItemQueryOptions): string {
  const clauses = [
    "[System.AssignedTo] = @Me",
    `[System.State] IN (${options.states.map(literal).join(",")})`,
  ];

  if (options.currentSprintOnly) {
    clauses.push("[System.IterationPath] UNDER @CurrentIteration");
  }

  return (
    `SELECT [System.Id] FROM WorkItems WHERE ${clauses.join(" AND ")}` +
    " ORDER BY [System.ChangedDate] DESC"
  );
}
