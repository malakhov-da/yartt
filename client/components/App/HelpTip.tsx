import { HelpOutline } from '@mui/icons-material';
import { Box, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * A "?" next to a title or a column: what it shows, on hover or focus —
 * instead of a line of explanation that everyone reads once and then
 * scrolls past. It is named "Explanation"; the text describes it.
 */
export default function (p: { title: string }) {
  const { t } = useTranslation();
  return (
    <Tooltip title={p.title} describeChild enterTouchDelay={0} leaveTouchDelay={6000}>
      <Box
        component="span"
        role="img"
        tabIndex={0}
        aria-label={t('common.explain')}
        onClick={(e) => e.stopPropagation()}
        sx={{ display: 'inline-flex', verticalAlign: 'middle', color: 'text.disabled', cursor: 'help', '&:hover, &:focus': { color: 'text.secondary' } }}
      >
        <HelpOutline sx={{ fontSize: 16 }} />
      </Box>
    </Tooltip>
  );
}
