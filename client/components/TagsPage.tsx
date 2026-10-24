import { Stack } from '@mui/material';
import TagLimits from './TagsPage/TagLimits.tsx';
import TagStats from './TagsPage/TagStats.tsx';

// Tags (`/tags`, docs/product/interface.md, 1): what happened under each tag
// (decision 58) and the budgets of hours on tag combinations (decision 69),
// over My day like a task, from the top line (decision 79).
export default function () {
  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 1280, mx: 'auto', alignSelf: 'flex-start' }}>
      <TagStats />
      <TagLimits />
    </Stack>
  );
}
