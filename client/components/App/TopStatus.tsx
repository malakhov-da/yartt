import { NotificationsNone, StopCircleOutlined } from '@mui/icons-material';
import { Badge, Button, IconButton, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import ShiftDialog from '../MyDayPage/ShiftDialog.tsx';

/**
 * What the top line shows on every page, a task page included: how much
 * waits for me in TODO (a click brings My day), and the open shift with its
 * running time — closed from here at the end of the day. A shift is started
 * in My day, where the first visit suggests its start.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const navigate = useNavigate();
  // The same query as the TODO block: one request, one cache.
  const todo = useQuery(trpc.MyDay.todo.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const shift = useQuery(trpc.Work.open.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const [closing, setClosing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const count = todo.data?.length ?? 0;
  const startedAt = shift.data?.startedAt;

  return (
    <>
      {startedAt && (
        <Tooltip title={t('nav.closeShift', { from: format.time(startedAt) })}>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            startIcon={<StopCircleOutlined />}
            onClick={() => setClosing(true)}
            sx={{ borderColor: 'divider', whiteSpace: 'nowrap' }}
          >
            {t('nav.shift', { time: format.minutes(Math.max(0, Math.floor((now - startedAt.getTime()) / 60_000))) })}
          </Button>
        </Tooltip>
      )}
      <Tooltip title={t('nav.todo', { count })}>
        <IconButton onClick={() => void navigate('/')} aria-label={t('nav.todo', { count })}>
          <Badge badgeContent={count} color="error" max={99}>
            <NotificationsNone />
          </Badge>
        </IconButton>
      </Tooltip>
      {closing && startedAt && (
        <ShiftDialog mode="close" from={startedAt} to={new Date()} onClose={() => setClosing(false)} />
      )}
    </>
  );
}
