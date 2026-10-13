import {
  Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Employee } from '#shared/employee.ts';
import { useMe } from '#client/hooks/me.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import InviteDialog from './EmployeesPage/InviteDialog.tsx';
import RestoreDialog from './EmployeesPage/RestoreDialog.tsx';

export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const employees = useQuery(trpc.Employee.list.queryOptions());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [restoring, setRestoring] = useState<Employee | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.Employee.list.queryKey() });
  const dismiss = useMutation(trpc.Employee.dismiss.mutationOptions({ onSuccess: refresh }));

  const byId = new Map((employees.data ?? []).map((e) => [e.id, e]));

  const confirmDismiss = (employee: Employee) => {
    if (window.confirm(t('employees.dismissConfirm', { name: employee.fullName }))) {
      dismiss.mutate({ id: employee.id });
    }
  };

  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, width: '100%', maxWidth: 1000, mx: 'auto' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h1">{t('employees.title')}</Typography>
        <Button variant="contained" onClick={() => setInviteOpen(true)}>
          {t('employees.invite')}
        </Button>
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('employees.name')}</TableCell>
              <TableCell>{t('employees.email')}</TableCell>
              <TableCell>{t('employees.manager')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.data?.map((employee) => (
              <TableRow key={employee.id}>
                <TableCell>
                  {employee.fullName}
                  {employee.id === me.id && <Chip size="small" label={t('employees.you')} sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>{employee.email ?? <Chip size="small" label={t('employees.dismissed')} />}</TableCell>
                <TableCell>{employee.managerId ? byId.get(employee.managerId)?.fullName : ''}</TableCell>
                <TableCell align="right">
                  {employee.email === null ? (
                    <Button size="small" onClick={() => setRestoring(employee)}>
                      {t('employees.restore')}
                    </Button>
                  ) : (
                    employee.id !== me.id && (
                      <Button
                        size="small"
                        color="error"
                        disabled={dismiss.isPending}
                        onClick={() => confirmDismiss(employee)}
                      >
                        {t('employees.dismiss')}
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={refresh} />
      {restoring && <RestoreDialog employee={restoring} onClose={() => setRestoring(null)} onDone={refresh} />}
    </Paper>
  );
}
