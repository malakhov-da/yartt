import { Box, Button, Dialog, DialogActions, DialogContent, Paper } from '@mui/material';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The height of a day card on an employee page: a week fits two rows on a wide screen. */
const HEIGHT = 260;

/**
 * A day as a card of a fixed size, for the employee page's grid: what does
 * not fit scrolls, and "Details" under it opens the whole day (with its
 * actions — scoring included) in a dialog.
 */
export default function (p: { children: ReactNode; dialog: ReactNode }) {
  const { t } = useTranslation();
  const body = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const check = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  });

  return (
    <Paper variant="outlined" sx={{ height: HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* What is unfolded in the card scrolls in it; "Details" sits under it, covering nothing. */}
      <Box ref={body} sx={{ p: 1.5, flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>{p.children}</Box>
      {overflows && (
        <Box sx={{ display: 'flex', justifyContent: 'center', borderTop: 1, borderColor: 'divider', py: 0.25 }}>
          <Button size="small" onClick={() => setOpen(true)}>{t('employee.dayDetails')}</Button>
        </Box>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogContent>{p.dialog}</DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
