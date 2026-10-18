import { CloudOff, NotificationsNone, StopCircleOutlined } from '@mui/icons-material';
import { Badge, Button, Chip, IconButton, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useFormat } from '#client/hooks/format.ts';
import { useOutbox } from '#client/hooks/offline.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import ShiftDialog, { shiftEnd } from '../MyDayPage/ShiftDialog.tsx';

/**
 * What the top line shows on every page, a task page included: whether
 * there is a connection and how many changes wait to be sent; how much
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
  const outbox = useOutbox();
  const online = useSyncExternalStore(
    (notify) => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
    },
    () => navigator.onLine,
  );
  const startedAt = shift.data?.startedAt;

  return (
    <>
      {(!online || outbox.length > 0) && (
        <Tooltip title={t('offline.hint')}>
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            icon={<CloudOff />}
            label={outbox.length ? t('offline.pending', { count: outbox.length }) : t('offline.offline')}
          />
        </Tooltip>
      )}
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
        <ShiftDialog mode="close" from={startedAt} to={shiftEnd()} onClose={() => setClosing(false)} />
      )}
    </>
  );
}
