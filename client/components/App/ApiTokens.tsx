import { ContentCopy } from '@mui/icons-material';
import { Alert, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '#client/hooks/format.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

/**
 * API tokens of an employee — mine in the profile, a report's (a bot's) on
 * their page: issue one for a program, see when each was used, revoke. A
 * new token is shown once, with a copy button; afterwards only its name.
 */
export default function (p: { employeeId: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const queryClient = useQueryClient();
  const tokens = useQuery(trpc.ApiToken.list.queryOptions({ employeeId: p.employeeId }));
  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.ApiToken.pathKey() });
  const [name, setName] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const issue = useMutation(trpc.ApiToken.issue.mutationOptions({
    onSuccess: ({ token }) => { setIssued(token); setName(''); refresh(); },
  }));
  const revoke = useMutation(trpc.ApiToken.revoke.mutationOptions({ onSuccess: refresh }));

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('apiTokens.hint')}</Typography>
      {issued && (
        <Alert
          severity="success"
          onClose={() => setIssued(null)}
          action={(
            <Tooltip title={t('apiTokens.copy')}>
              <IconButton size="small" onClick={() => { void navigator.clipboard?.writeText(issued); showInfo(t('apiTokens.copied')); }}>
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        >
          <Typography variant="body2">{t('apiTokens.issued')}</Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{issued}</Typography>
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          label={t('apiTokens.name')}
          placeholder={t('apiTokens.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
        <Button variant="outlined" disabled={!name.trim() || issue.isPending} onClick={() => issue.mutate({ employeeId: p.employeeId, name })}>
          {t('apiTokens.issue')}
        </Button>
      </Stack>
      {tokens.data?.map((token) => (
        <Stack key={token.id} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5, borderTop: 1, borderColor: 'divider' }}>
          <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, textDecoration: token.revokedAt ? 'line-through' : 'none' }}>{token.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('apiTokens.meta', {
                by: employees.get(token.createdBy)?.fullName ?? `#${token.createdBy}`,
                at: format.dateTime(token.createdAt),
                used: token.lastUsedAt ? format.dateTime(token.lastUsedAt) : t('apiTokens.neverUsed'),
              })}
            </Typography>
          </Stack>
          {token.revokedAt ? (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('apiTokens.revoked')}</Typography>
          ) : (
            <Button size="small" color="error" disabled={revoke.isPending} onClick={() => revoke.mutate({ id: token.id })}>
              {t('apiTokens.revoke')}
            </Button>
          )}
        </Stack>
      ))}
    </Stack>
  );
}
