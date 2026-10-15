import { Chip, Stack, TextField } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PERIODS } from '#shared/team.ts';
import { today } from '#client/hooks/format.ts';

export type Range = { from: string; to: string };

/** YYYY-MM-DD `days` days before `day`. */
function minusDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const lastDays = (days: number): Range => ({ from: minusDays(today(), days - 1), to: today() });

/** A range of days, the last 30 by default; `valid` — from is not after to. */
export function useRange(): [Range, (range: Range) => void, boolean] {
  const [range, setRange] = useState<Range>(() => lastDays(30));
  return [range, setRange, range.from <= range.to];
}

/** Quick ranges (the last 7, 30, 90 days) or any dates. */
export default function (p: { range: Range; onChange: (range: Range) => void }) {
  const { t } = useTranslation();
  const { range } = p;
  const isQuick = (days: number) => range.to === today() && range.from === lastDays(days).from;

  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      {PERIODS.map((days) => (
        <Chip
          key={days}
          size="small"
          label={t('employee.stats.days', { count: days })}
          color={isQuick(days) ? 'primary' : 'default'}
          variant={isQuick(days) ? 'filled' : 'outlined'}
          onClick={() => p.onChange(lastDays(days))}
        />
      ))}
      <TextField
        type="date"
        size="small"
        label={t('employee.stats.from')}
        value={range.from}
        onChange={(e) => e.target.value && p.onChange({ ...range, from: e.target.value })}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: range.to } }}
        sx={{ width: 150 }}
      />
      <TextField
        type="date"
        size="small"
        label={t('employee.stats.to')}
        value={range.to}
        onChange={(e) => e.target.value && p.onChange({ ...range, to: e.target.value })}
        error={range.from > range.to}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: range.from, max: today() } }}
        sx={{ width: 150 }}
      />
    </Stack>
  );
}
