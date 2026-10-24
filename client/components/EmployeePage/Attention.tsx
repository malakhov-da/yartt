import { Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { POLL_MS, usePronoun } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { TodoList } from '../MyDayPage/Todo.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';

/**
 * For a manager on a report's page (decision 78): what waits for the
 * report's attention — their Waiting for me as they see it, without their
 * reminders or buttons — and the open tasks they own, by deadline. Seen at
 * once, without asking in a meeting.
 */
export default function (p: { employeeId: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const pronoun = usePronoun();
  const attention = useQuery(trpc.Team.attention.queryOptions({ employeeId: p.employeeId }, { refetchInterval: POLL_MS }));
  if (!attention.data) return null;
  const { todo, tasks } = attention.data;
  const forms = pronoun(p.employeeId);

  return (
    <>
      <Paper component="section" aria-label={t('employee.attention.title', forms)} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, flex: '1 1 420px', minWidth: 0 }}>
        <Typography variant="h3" sx={{ fontWeight: 600 }}>
          {t('employee.attention.title', forms)}{todo.length > 0 && ` · ${todo.length}`}
        </Typography>
        {todo.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('employee.attention.empty')}</Typography>}
        <TodoList items={todo} readOnly />
      </Paper>
      <Paper component="section" aria-label={t('employee.attention.tasks', forms)} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, flex: '1 1 420px', minWidth: 0 }}>
        <Typography variant="h3" sx={{ fontWeight: 600 }}>
          {t('employee.attention.tasks', forms)}{tasks.length > 0 && ` · ${tasks.length}`}
        </Typography>
        {tasks.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('employee.attention.noTasks')}</Typography>}
        <Stack spacing={0.75}>
          {tasks.map((task) => <TaskLine key={task.id} task={task} />)}
        </Stack>
      </Paper>
    </>
  );
}
