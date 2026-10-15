import { Avatar, colors } from '@mui/material';
import type { Employee } from '#shared/employee.ts';
import { avatarUrl } from '#client/hooks/avatar.ts';

// The uploaded picture, or the initials on a color fixed by the id.
const PALETTE = [
  colors.red[400], colors.pink[400], colors.purple[400], colors.indigo[400], colors.blue[500],
  colors.teal[500], colors.green[600], colors.orange[600], colors.brown[400], colors.blueGrey[500],
];

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

export default function (p: { employee: Pick<Employee, 'id' | 'fullName'> & Partial<Pick<Employee, 'avatarAt'>>; size?: number }) {
  const size = p.size ?? 32;
  const { avatarAt } = p.employee;
  return (
    <Avatar
      src={avatarAt ? avatarUrl(p.employee.id, avatarAt) : undefined}
      alt={p.employee.fullName}
      sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: PALETTE[p.employee.id % PALETTE.length] }}
    >
      {initials(p.employee.fullName)}
    </Avatar>
  );
}
