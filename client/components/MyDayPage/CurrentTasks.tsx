import { Add, Search } from '@mui/icons-material';
import { Button, InputAdornment, Pagination, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import type { CurrentTab } from '#shared/myDay.ts';
import type { Tag } from '#shared/task.ts';
import { useStore } from '#client/hooks/store.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TagInput from '../App/TagInput.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';

const PAGE_SIZE = 20;
const TABS = ['mine', 'others'] as const;

/**
 * Every open task I see: mine apart from the others (decision 8), by
 * deadline, with pages. The search on top narrows both tabs to the tasks
 * carrying the picked tags — any task then, closed and not mine included;
 * the typed text only finds tags ("/" focuses it from anywhere). "New task"
 * in my tab opens the form with the picked tags.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<CurrentTab>('mine');
  const [pages, setPages] = useState<Record<CurrentTab, number>>({ mine: 1, others: 1 });
  const [tags, setTags] = useState<Tag[]>([]);
  const [input, setInput] = useState('');
  const filtering = tags.length > 0;
  const page = pages[tab];

  const current = useQuery(trpc.MyDay.current.queryOptions(
    { tab, page },
    { enabled: !filtering, refetchInterval: POLL_MS, placeholderData: keepPreviousData },
  ));
  const found = useQuery(trpc.Task.search.queryOptions(
    { tagIds: tags.map((tag) => tag.id), tab, page },
    { enabled: filtering, placeholderData: keepPreviousData },
  ));
  const shown = filtering ? found : current;
  const counts = shown.data?.counts;
  const total = counts?.[tab] ?? 0;

  // A new filter starts from the first page.
  const filter = (next: { tags?: Tag[]; input?: string }) => {
    if (next.tags) setTags(next.tags);
    if (next.input !== undefined) setInput(next.input);
    setPages({ mine: 1, others: 1 });
  };

  // Nothing found in this tab but something in the other: show that one,
  // once per filter, so the empty tab can still be opened by hand.
  const other = tab === 'mine' ? 'others' : 'mine';
  const foundCounts = found.isPlaceholderData ? undefined : found.data?.counts;
  const filterKey = JSON.stringify(tags.map((tag) => tag.id));
  const switchedFor = useRef('');
  useEffect(() => {
    if (!filtering || !foundCounts || switchedFor.current === filterKey) return;
    switchedFor.current = filterKey;
    if (foundCounts[tab] === 0 && foundCounts[other] > 0) setTab(other);
  }, [filtering, foundCounts, filterKey, tab, other]);

  // The search gets the focus once My day is on screen (it is hidden under a task).
  const wantsFocus = useRef(false);
  // The address is read when the key is pressed: right after following a link
  // the last render may still think My day is on screen.
  const focusSearch = () => {
    wantsFocus.current = true;
    if (window.location.pathname === '/') inputRef.current?.focus();
    else void navigate('/');
  };
  useEffect(() => {
    if (pathname !== '/' || !wantsFocus.current) return;
    wantsFocus.current = false;
    inputRef.current?.focus();
  }, [pathname]);

  // "/" outside inputs: back to My day and into the search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '/' || target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      focusSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Another place asked to search by tags (a tag in My tags).
  const requested = useStore((s) => s.searchTags);
  useEffect(() => {
    if (!requested) return;
    filter({ tags: requested, input: '' });
    useStore.setState({ searchTags: null });
    focusSearch();
  });

  return (
    <Paper component="section" aria-label={t('myDay.current.title')} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('myDay.current.title')}</Typography>
      <TagInput
        value={tags.map((tag) => ({ tag }))}
        onChange={(next) => filter({ tags: next.flatMap((part) => ('tag' in part ? [part.tag] : [])) })}
        input={input}
        onInputChange={(next) => filter({ input: next })}
        placeholder={t('search.placeholder')}
        inputRef={inputRef}
        startAdornment={<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>}
        sx={{ mt: 0.5 }}
      />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
        <Tabs value={tab} onChange={(_, value: CurrentTab) => setTab(value)} sx={{ minHeight: 0, flexGrow: 1 }}>
          {TABS.map((value) => (
            <Tab
              key={value}
              value={value}
              label={t(`myDay.current.${value}`, { count: counts?.[value] ?? 0 })}
              sx={{ minHeight: 0, py: 1 }}
            />
          ))}
        </Tabs>
        {tab === 'mine' && (
          <Button component={Link} to="/tasks/new" state={{ tags }} size="small" variant="outlined" startIcon={<Add />}>
            {t('newTask.title')}
          </Button>
        )}
      </Stack>
      {shown.isSuccess && total === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>
          {filtering ? t('search.noResults') : t(`myDay.current.${tab}Empty`)}
        </Typography>
      )}
      <Stack spacing={0.75} sx={{ opacity: shown.isPlaceholderData ? 0.6 : 1 }}>
        {shown.data?.items.map((task) => <TaskLine key={task.id} task={task} />)}
      </Stack>
      {total > PAGE_SIZE && (
        <Pagination
          count={Math.ceil(total / PAGE_SIZE)}
          page={page}
          onChange={(_, value) => setPages((prev) => ({ ...prev, [tab]: value }))}
          sx={{ alignSelf: 'center', mt: 1 }}
        />
      )}
    </Paper>
  );
}
