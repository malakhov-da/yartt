import { Box, Typography, createFilterOptions } from '@mui/material';
import type { HTMLAttributes, Key } from 'react';
import type { Employee } from '#shared/employee.ts';
import EmployeeAvatar from './EmployeeAvatar.tsx';

/**
 * How a person is offered wherever one is picked: the avatar, the name and,
 * under it, what they wrote about themselves — two people of one name, or
 * one known by the role, are told apart at a glance.
 */
export function employeeOption(props: HTMLAttributes<HTMLLIElement> & { key: Key }, e: Employee) {
  const { key, ...rest } = props;
  return (
    <Box component="li" key={key} {...rest} sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
      <EmployeeAvatar employee={e} size={28} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2">{e.fullName}</Typography>
        {e.about && (
          <Typography variant="caption" component="div" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {e.about}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/** Typed text finds a person by the name or by what they wrote about themselves ("frontend"). */
export const employeeFilter = createFilterOptions<Employee>({ stringify: (e) => `${e.fullName} ${e.about ?? ''}` });
