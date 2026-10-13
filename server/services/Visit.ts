import { sql } from '../pg.ts';

/** Logs a visit to a task, or to "My day" when taskId is null (throttled in log_visit()). */
export async function log(employeeId: number, taskId: number | null): Promise<void> {
  await sql`SELECT log_visit(${employeeId}, ${taskId})`;
}
