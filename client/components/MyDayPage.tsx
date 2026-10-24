import { Box, Stack, Typography } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeamRole } from '#client/hooks/me.ts';
import CurrentTasks from './MyDayPage/CurrentTasks.tsx';
import History from './MyDayPage/History.tsx';
import Todo from './MyDayPage/Todo.tsx';
import Waiting from './MyDayPage/Waiting.tsx';

// The only screen (docs/product/interface.md, 1): what needs me, my current
// tasks, my team (someone with reports), my days. It stays mounted while a
// task or a person is open (App.tsx), which logs every screen opened as a
// visit. At the bottom, the product name and its release (decision 30).
export default function () {
  const { t } = useTranslation();
  const { isManager } = useTeamRole();

  // Side by side, the days scroll on their own: the height of the page's
  // scrolling area, less its padding, so the tasks scroll past them.
  const side = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ top: number; height: number }>();
  useLayoutEffect(() => {
    const main = side.current?.closest('main');
    if (!main) return;
    const measure = () => {
      const style = getComputedStyle(main);
      const top = parseFloat(style.paddingTop);
      setFit({ top, height: main.clientHeight - top - parseFloat(style.paddingBottom) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    return () => observer.disconnect();
  }, []);

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2 }}>
        <Stack spacing={2} sx={{ flex: '999 1 560px', minWidth: 0 }}>
          <Todo />
          <Waiting />
          <CurrentTasks team={isManager} />
        </Stack>
        <Box
          ref={side}
          sx={{
            flex: '1 1 400px', minWidth: 0,
            // Wide enough for the two columns (560 + 400 + the gaps).
            ...(fit && fit.height > 0 && {
              '@media (min-width: 1024px)': { position: 'sticky', top: 0, maxHeight: fit.height, overflowY: 'auto', overscrollBehavior: 'contain' },
            }),
          }}
        >
          <History />
        </Box>
      </Box>
      <Typography component="footer" variant="caption" color="text.secondary" align="center">
        {t('app.name')} {__APP_VERSION__} · © 2026
      </Typography>
    </Stack>
  );
}
