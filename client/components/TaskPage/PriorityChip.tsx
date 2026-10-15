import { Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Priority } from '#shared/task.ts';

const COLORS = {
  LOW: 'default',
  NORMAL: 'default',
  HIGH: 'warning',
  CRITICAL: 'error',
} as const;

export default function (p: { priority: Priority }) {
  const { t } = useTranslation();
  return (
    <Chip
      size="small"
      color={COLORS[p.priority]}
      variant={p.priority === 'LOW' ? 'outlined' : 'filled'}
      label={t(`task.priority.${p.priority}`)}
    />
  );
}
