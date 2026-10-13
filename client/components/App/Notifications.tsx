import { Alert, Snackbar } from '@mui/material';
import { useStore } from '#client/hooks/store.ts';

export default function () {
  const { error, info } = useStore();

  return (
    <>
      <Snackbar open={!!error} onClose={() => useStore.setState({ error: '' })}>
        <Alert severity="error" onClose={() => useStore.setState({ error: '' })}>
          {error}
        </Alert>
      </Snackbar>
      <Snackbar open={!!info} onClose={() => useStore.setState({ info: '' })}>
        <Alert severity="info" onClose={() => useStore.setState({ info: '' })}>
          {info}
        </Alert>
      </Snackbar>
    </>
  );
}
