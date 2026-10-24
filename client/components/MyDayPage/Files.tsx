import { AttachFile } from '@mui/icons-material';
import { Box, Button, LinearProgress, Link as MuiLink, Paper, Stack, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useFormat } from '#client/hooks/format.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { useViewAs } from '#client/hooks/viewAs.ts';
import { attachmentUrl } from '#client/hooks/upload.ts';

/** Bytes as people read them: "840 KB", "12.5 MB". */
export function useBytes(): (bytes: number) => string {
  const { t } = useTranslation();
  return (bytes) => {
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? t('files.mb', { value: Math.round(mb * 10) / 10 }) : t('files.kb', { value: Math.max(1, Math.round(bytes / 1024)) });
  };
}

/**
 * My files (decision 84), folded at the end of My day: how much of my quota
 * they take, and every file I uploaded — its names in comments, its tasks,
 * when — the newest first. "Delete" frees the space: the content goes, the
 * links stay and say so, and the same file uploaded again brings it back.
 * On a report's page — theirs, read-only.
 */
export default function (p: { fold?: ReactNode }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const bytes = useBytes();
  const { as, readOnly } = useViewAs();
  const mine = useQuery(trpc.Attachment.mine.queryOptions(as === undefined ? undefined : { as }));
  const purge = useMutation(trpc.Attachment.purge.mutationOptions({ onSuccess: () => void mine.refetch() }));
  const data = mine.data;
  const share = data ? Math.min(100, (data.usedBytes / data.quotaBytes) * 100) : 0;

  return (
    <Paper component="section" aria-label={t('files.title')} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('files.title')}</Typography>
        {p.fold}
      </Stack>
      {data && (
        <Stack spacing={0.5}>
          <Typography variant="body2">{t('files.used', { used: bytes(data.usedBytes), quota: bytes(data.quotaBytes) })}</Typography>
          <LinearProgress variant="determinate" value={share} color={share >= 90 ? 'warning' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('files.rules', { big: bytes(data.bigBytes), days: data.bigDays })}
          </Typography>
        </Stack>
      )}
      {data?.files.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('files.none')}</Typography>}
      <Stack spacing={0.75}>
        {data?.files.map((f) => {
          const name = f.names.join(', ') || t('files.unnamed');
          return (
            <Stack key={f.id} direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', opacity: f.purgedAt ? 0.6 : 1 }}>
              <AttachFile fontSize="small" sx={{ color: 'text.secondary' }} />
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                {f.purgedAt ? (
                  <Typography variant="body2" sx={{ textDecoration: 'line-through', overflowWrap: 'anywhere' }}>{name}</Typography>
                ) : (
                  <MuiLink href={attachmentUrl(f.id, f.names[0])} variant="body2" sx={{ overflowWrap: 'anywhere' }}>{name}</MuiLink>
                )}
                <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
                  {bytes(f.size)} · {format.date(f.addedAt)}
                  {f.taskIds.map((id) => (
                    <span key={id}>{' · '}<MuiLink component={Link} to={`/tasks/${id}`}>#{id}</MuiLink></span>
                  ))}
                  {f.purgedAt && ` · ${t('files.purged', { date: format.date(f.purgedAt) })}`}
                </Typography>
              </Box>
              {!f.purgedAt && !readOnly && (
                <Button size="small" color="inherit" disabled={purge.isPending} onClick={() => purge.mutate({ id: f.id })}>
                  {t('files.delete')}
                </Button>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
