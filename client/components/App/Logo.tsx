import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/**
 * The mark: a tag — tasks have no titles, only tags — with a check: every
 * task has one owner who sees it done. Also the favicon (public/favicon.svg).
 */
export function Mark(p: { size?: number }) {
  const size = p.size ?? 24;
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: size, height: size, flexShrink: 0, color: 'primary.main' }} aria-hidden>
      <path
        fill="currentColor"
        d="M2.5 4.5a2 2 0 0 1 2-2h7.17a2 2 0 0 1 1.42.59l8.32 8.32a2 2 0 0 1 0 2.83l-7.17 7.17a2 2 0 0 1-2.83 0L3.09 13.09a2 2 0 0 1-.59-1.42z"
      />
      <circle cx="7" cy="7" r="1.6" fill="#fff" />
      <path d="M8.6 13.2l2.6 2.6 5-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

/** The mark and the name in the interface language (yartt / яртт); leads home. */
export default function () {
  const { t } = useTranslation();
  return (
    <Box component={Link} to="/" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.primary', textDecoration: 'none', mr: 2 }}>
      <Mark size={26} />
      <Typography sx={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{t('app.name')}</Typography>
    </Box>
  );
}
