import { WarningAmber } from '@mui/icons-material';
import { Chip, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TaskHeader } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useEmployees } from '#client/hooks/task.ts';

/**
 * "At risk": the deadline will not be met by a person's plan. Status colour
 * with an icon and a word, never colour alone; the hint says whose plan and
 * how far it is over their working time.
 */
export default function (p: { task: TaskHeader }) {
  const { t } = useTranslation();
  const format = useFormat();
  const employees = useEmployees();
  const { risk, deadline } = p.task;
  if (!risk || !deadline) return null;
  const days = Math.max(0, Math.round((deadline.getTime() - Date.now()) / 86_400_000));
  return (
    <Tooltip
      describeChild
      title={t('task.risk.hint', {
        days,
        name: employees.get(risk.employeeId)?.fullName ?? `#${risk.employeeId}`,
        planned: format.minutes(risk.plannedMinutes),
        capacity: format.minutes(risk.capacityMinutes),
      })}
    >
      <Chip size="small" color="warning" variant="outlined" icon={<WarningAmber />} label={t('task.risk.label')} />
    </Tooltip>
  );
}
