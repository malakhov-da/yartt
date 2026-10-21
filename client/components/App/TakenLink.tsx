import { Link as MuiLink } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/**
 * "Such a task already exists: #12" — a link to it, wherever a title is
 * typed: the search, a new task, a title changed, a task made for a
 * dependency. Titles are unique; the one typed may be the one wanted.
 */
export default function (p: { id: number }) {
  const { t } = useTranslation();
  return <MuiLink component={Link} to={`/tasks/${p.id}`}>{t('title.taken', { id: p.id })}</MuiLink>;
}
