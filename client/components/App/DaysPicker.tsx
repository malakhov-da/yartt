import { Chip, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';

/** The last N days the summaries of Tags and Bots offer, today included. */
export const LAST_DAYS = [7, 30, 90, 365] as const;

/**
 * The last N days, today included: a range that always ends now, so the
 * plans of now belong next to it (Tags and Bots; My team keeps any dates).
 */
export default function (p: { days: number; onChange: (days: number) => void }) {
  const { t } = useTranslation();
  return (
    <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
      {LAST_DAYS.map((days) => (
        <Chip
          key={days}
          size="small"
          label={t('employee.stats.days', { count: days })}
          color={p.days === days ? 'primary' : 'default'}
          variant={p.days === days ? 'filled' : 'outlined'}
          onClick={() => p.onChange(days)}
        />
      ))}
    </Stack>
  );
}
