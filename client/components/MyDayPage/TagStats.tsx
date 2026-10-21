import { ChevronRight, Download, ExpandMore, Search, WarningAmber } from '@mui/icons-material';
import {
  Box, Button, Collapse, IconButton, InputAdornment, Pagination, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, Typography,
} from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagGroup, TagStatsRow } from '#shared/tags.ts';
import type { Tag } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { csv, download, type Cell } from '#client/hooks/xlsx.ts';
import DaysPicker from '../App/DaysPicker.tsx';
import TagChip from '../App/TagChip.tsx';
import TagInput from '../App/TagInput.tsx';
import TagDetail, { percent } from './TagDetail.tsx';

const PAGE_SIZE = 20;
const key = (group: TagGroup) => (group.kind === 'tag' ? `t${group.tagId}` : `${group.kind}${group.tagIds.join(',')}`);

/**
 * Tags (decision 58): what happened under each tag over the last days, on
 * the tasks I see — anyone has it, counted only on what they may see.
 * Without a search every rubric, the most active first, with pages; with
 * tags picked — those, and for two or more all of them together and any of
 * them. A line unfolds into charts of its activity and its people (TagDetail)
 * — each one's own time, share and plan, never a total (decision 38) — and
 * everything shown goes out as CSV.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const format = useFormat();
  const employees = useEmployees();
  const [days, setDays] = useState(30);
  const [tags, setTags] = useState<Tag[]>([]);
  const [input, setInput] = useState('');
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const statsInput = { days, tagIds: tags.map((tag) => tag.id), page };
  const stats = useQuery(trpc.Tags.stats.queryOptions(statsInput, {
    refetchInterval: POLL_MS, placeholderData: keepPreviousData,
  }));
  const rows = stats.data?.rows ?? [];
  const picked = tags.length > 0;
  const pages = picked ? 1 : Math.ceil((stats.data?.total ?? 0) / PAGE_SIZE);
  const flip = (k: string) => setOpened((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    return next;
  });
  const label = (row: TagStatsRow) => (row.group.kind === 'tag' ? row.tags[0]?.name ?? '' : t(`tagStats.${row.group.kind}`, {
    tags: row.tags.map((tag) => tag.name).join(', '),
  }));
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;

  // Every line shown and its people, one row per person and line: no total of anyone's hours.
  const hours = (minutes: number | null) => (minutes === null ? null : Math.round((minutes / 60) * 100) / 100);
  const exportCsv = async () => {
    const head: Cell[] = [
      t('tagStats.export.tag'), t('tagStats.export.person'), t('tagStats.export.hours'), t('tagStats.export.share'),
      t('tagStats.export.plan'), t('tagStats.export.comments'),
    ];
    const lines: Cell[][] = [head];
    for (const row of rows) {
      const detail = await queryClient.fetchQuery(trpc.Tags.detail.queryOptions({ days, group: row.group }));
      for (const person of detail.persons) {
        lines.push([
          label(row), name(person.employeeId), hours(person.minutes),
          person.share === null ? null : Math.round(person.share * 100), hours(person.leftMinutes), person.comments,
        ]);
      }
    }
    download(`${t('tagStats.export.file')}-${days}.csv`, csv(lines), 'text/csv;charset=utf-8');
  };

  return (
    <Paper component="section" aria-label={t('tagStats.region')} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('tagStats.title')}</Typography>
        <Button size="small" startIcon={<Download />} disabled={rows.length === 0} onClick={() => void exportCsv()}>
          {t('tagStats.export.action')}
        </Button>
      </Stack>
      <TagInput
        value={tags.map((tag) => ({ tag }))}
        onChange={(next) => { setTags(next.flatMap((part) => ('tag' in part ? [part.tag] : []))); setPage(1); }}
        input={input}
        onInputChange={setInput}
        placeholder={t('tagStats.search')}
        startAdornment={<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>}
      />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('tagStats.hint')}</Typography>
      <DaysPicker days={days} onChange={(next) => { setDays(next); setPage(1); }} />
      {stats.isSuccess && rows.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('tagStats.empty')}</Typography>
      )}
      {rows.length > 0 && (
        <Box sx={{ opacity: stats.isPlaceholderData ? 0.6 : 1 }}>
          <Table
            size="small"
            sx={{
              '& td, & th': { px: { xs: 0.25, sm: 0.75 } },
              '& th': { color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap' },
              '& td:nth-of-type(3), & th:nth-of-type(3), & td:nth-of-type(4), & th:nth-of-type(4)': { display: { xs: 'none', sm: 'table-cell' } },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>{t('tagStats.tag')}</TableCell>
                <TableCell align="right"><Tooltip title={t('tagStats.tasksHint')} describeChild><span>{t('tagStats.tasks')}</span></Tooltip></TableCell>
                <TableCell align="right"><Tooltip title={t('tagStats.closedHint')} describeChild><span>{t('tagStats.closed')}</span></Tooltip></TableCell>
                <TableCell align="right"><Tooltip title={t('tagStats.commentsHint')} describeChild><span>{t('tagStats.comments')}</span></Tooltip></TableCell>
                <TableCell align="right"><Tooltip title={t('tagStats.peopleHint')} describeChild><span>{t('tagStats.people')}</span></Tooltip></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const k = key(row.group);
                const open = opened.has(k);
                return (
                  <Fragment key={k}>
                    <TableRow hover selected={open} onClick={() => flip(k)} aria-expanded={open} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <IconButton size="small" aria-label={t(open ? 'tagStats.fold' : 'tagStats.unfold', { name: label(row) })}>
                            {open ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
                          </IconButton>
                          {row.group.kind === 'tag'
                            ? row.tags[0] && <TagChip size="small" tag={row.tags[0]} />
                            : <Typography variant="body2" sx={{ fontWeight: 600 }}>{label(row)}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
                          {row.atRisk > 0 && (
                            <Tooltip title={t('myDay.team.atRiskCount', { count: row.atRisk })}>
                              <Stack direction="row" sx={{ alignItems: 'center', color: 'warning.dark', fontWeight: 600 }}>
                                <WarningAmber sx={{ fontSize: 16 }} />{row.atRisk}
                              </Stack>
                            </Tooltip>
                          )}
                          {t('tagStats.openOf', { open: row.open, tasks: row.tasks })}
                        </Stack>
                        {row.stale > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'warning.dark' }}>
                            {t('tagStats.stale', { count: row.stale })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {row.finished + row.expired}
                        {row.expired > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            {t('tagStats.expired', { count: row.expired })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {row.comments}
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                          {t('tagStats.activeTasks', { count: row.active })}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {row.people}
                        {row.share !== null && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            {t('tagStats.shareNote', { share: percent(row.share) })}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ p: 0, borderBottom: open ? undefined : 0, display: 'table-cell !important' }}>
                        <Collapse in={open} unmountOnExit>
                          <TagDetail group={row.group} days={days} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}
      {pages > 1 && <Pagination count={pages} page={page} onChange={(_, value) => setPage(value)} sx={{ alignSelf: 'center' }} />}
    </Paper>
  );
}

