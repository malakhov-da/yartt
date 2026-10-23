import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Tag, TaskHeader } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useEmployees } from '#client/hooks/task.ts';
import EmployeeAvatar from '../App/EmployeeAvatar.tsx';
import TaskHint from '../App/TaskHint.tsx';
import TagChip from '../App/TagChip.tsx';
import PriorityChip from './PriorityChip.tsx';
import RiskChip from './RiskChip.tsx';

/**
 * A task as a line: number, tags, priority, a note (`noteWarn` — something is wrong), deadline, owner. A closed
 * one (its deadline passed) is struck through. `dense` — only the number,
 * tags and the note, for narrow lists. Hovered, it shows its context and
 * everyone's time on it (TaskHint). `onTag` — a tag clicked does that
 * instead of opening the task (Current tasks: it narrows the search).
 */
export default function (p: {
  task: TaskHeader; note?: string; noteHint?: string; noteWarn?: boolean; dense?: boolean; onTag?: (tag: Tag) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const employees = useEmployees();
  const owner = p.task.ownerId === null ? undefined : employees.get(p.task.ownerId);
  const closed = p.task.deadline !== null && p.task.deadline <= new Date();

  return (
    <TaskHint taskId={p.task.id}>
    <Stack
      direction="row"
      component={Link}
      to={`/tasks/${p.task.id}`}
      sx={{
        alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 1.25, py: p.dense ? 0.25 : 0.75, border: 1, borderColor: 'divider',
        borderRadius: 1, color: closed ? 'text.secondary' : 'text.primary', textDecoration: 'none',
        bgcolor: closed ? 'action.hover' : 'background.paper', '&:hover': { borderColor: 'primary.light' },
      }}
    >
      {/* The number looks like the link it is: the way into the task wherever it is shown. */}
      <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'primary.main', '*:hover > &': { textDecoration: 'underline' } }}>#{p.task.id}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flex: '1 1 160px', minWidth: 0, textDecoration: closed ? 'line-through' : 'none' }}>
        {p.task.tags.map((tag) => {
          const onTag = p.onTag;
          return onTag ? (
            <Tooltip key={tag.id} title={t('search.addTag')} describeChild>
              <TagChip
                size="small"
                tag={tag}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTag(tag); }}
              />
            </Tooltip>
          ) : <TagChip key={tag.id} size="small" tag={tag} />;
        })}
      </Box>
      {!p.dense && !closed && <RiskChip task={p.task} />}
      {!p.dense && <PriorityChip priority={p.task.priority} />}
      {p.note && (
        <Tooltip title={p.noteHint ?? ''} describeChild>
          <Typography
            variant="caption"
            sx={{ color: p.noteWarn ? 'warning.dark' : 'text.secondary', fontWeight: p.noteWarn ? 600 : undefined, ...(p.noteHint && { cursor: 'help', borderBottom: 1, borderStyle: 'dotted', borderColor: 'text.disabled' }) }}
          >
            {p.note}
          </Typography>
        </Tooltip>
      )}
      {!p.dense && (
        <>
          <Typography variant="body2" sx={{ minWidth: 64, textAlign: 'right' }}>
            {p.task.deadline ? format.date(p.task.deadline) : t('task.noDeadline')}
          </Typography>
          {owner && <EmployeeAvatar employee={owner} size={24} />}
        </>
      )}
    </Stack>
    </TaskHint>
  );
}
