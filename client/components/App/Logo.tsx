import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/**
 * The mark: a tag — tasks have no titles, only tags — with a check: every
 * task has one owner who sees it done. The tag takes off like a rocket: done
 * tasks are how a product gets built and shipped. Also the favicon
 * (public/favicon.svg).
 */
export function Mark(p: { size?: number }) {
  const size = p.size ?? 24;
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: size, height: size, flexShrink: 0, color: 'primary.main' }} aria-hidden>
      <path
        fill="currentColor"
        transform="translate(1.3 -1.3) rotate(-90 12 12) translate(12 12) scale(.86) translate(-12 -12)"
        d="M2.5 4.5a2 2 0 0 1 2-2h7.17a2 2 0 0 1 1.42.59l8.32 8.32a2 2 0 0 1 0 2.83l-7.17 7.17a2 2 0 0 1-2.83 0L3.09 13.09a2 2 0 0 1-.59-1.42z"
      />
      <circle cx="6.9" cy="17.1" r="1.4" fill="#fff" />
      <path d="M9.7 13.1l2.3 2.3 4.5-4.5" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.6 22.4l2.6-2.6M1.2 18.9l1.4-1.4M5.1 22.8l1.4-1.4" stroke="#f57c00" strokeWidth="1.9" strokeLinecap="round" />
    </Box>
  );
}

/**
 * The mark and the name of the only screen — My day — in the interface
 * language; leads there. The product name is in the window title and the
 * footer of My day (decision 30).
 */
export default function () {
  const { t } = useTranslation();
  return (
    <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.primary', textDecoration: 'none', mr: 2 }}>
      <Mark size={26} />
      <Typography sx={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{t('nav.myDay')}</Typography>
    </Box>
  );
}
