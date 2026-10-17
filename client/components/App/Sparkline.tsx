import { Box, useTheme } from '@mui/material';

const WIDTH = 72;
const HEIGHT = 18;
const PAD = 2;

/**
 * A tiny trend of one person over the days of a range, under a number in a
 * table: a line for a continuous value (time in tasks), dots for a sparse
 * one (scored days). Muted — the number above is what is read; the last
 * value is in the accent. Hovering a day tells its date and value.
 */
export default function (p: {
  days: string[];
  values: (number | null)[];
  kind: 'line' | 'dots';
  /** The top of the scale; values above stretch it. */
  max: number;
  label: (day: string, value: number) => string;
}) {
  const theme = useTheme();
  const top = Math.max(p.max, ...p.values.map((v) => v ?? 0));
  const n = p.values.length;
  if (n === 0 || p.values.every((v) => v === null)) return null;
  const x = (i: number) => PAD + (n === 1 ? (WIDTH - 2 * PAD) / 2 : (i * (WIDTH - 2 * PAD)) / (n - 1));
  const y = (v: number) => HEIGHT - PAD - (v / top) * (HEIGHT - 2 * PAD);
  // CSS variables follow the light or dark scheme; SVG takes them in style, not in attributes.
  const palette = (theme.vars ?? theme).palette;
  const muted = palette.text.disabled;
  const accent = palette.primary.main;
  const lastIndex = p.values.reduce<number>((last, v, i) => (v === null ? last : i), -1);

  // A line breaks where a day has no value.
  const segments: string[] = [];
  let current = '';
  p.values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = '';
    } else {
      current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }
  });
  if (current) segments.push(current);

  return (
    <Box component="svg" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} sx={{ display: 'block', ml: 'auto', mt: 0.25 }} aria-hidden>
      {p.kind === 'line' && segments.map((d, i) => (
        <path key={i} d={d} fill="none" style={{ stroke: muted }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {p.values.map((v, i) => v !== null && (p.kind === 'dots' || i === lastIndex) && (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === lastIndex ? 2.5 : 2} style={{ fill: i === lastIndex ? accent : muted }} />
      ))}
      {/* Hit targets wider than the marks: a column per day. */}
      {p.values.map((v, i) => v !== null && (
        <rect key={`h${i}`} x={x(i) - WIDTH / n / 2} y={0} width={WIDTH / n} height={HEIGHT} fill="transparent">
          <title>{p.label(p.days[i]!, v)}</title>
        </rect>
      ))}
    </Box>
  );
}
