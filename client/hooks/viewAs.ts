import { createContext, useContext } from 'react';

/**
 * Whose My day the blocks under it show (decision 83): nobody's set — the
 * signed-in employee's own; `as` — a report's, on their page, for a manager
 * above. Then the blocks ask for that person's data and keep their buttons
 * away: the manager looks with the report's eyes and changes nothing.
 */
export const ViewAs = createContext<{ as?: number }>({});

export function useViewAs(): { as: number | undefined; readOnly: boolean } {
  const { as } = useContext(ViewAs);
  return { as, readOnly: as !== undefined };
}
