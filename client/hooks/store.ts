import { create } from 'zustand';
import { errorMessage } from '#client/i18n/errors.ts';

type AppState = {
  error: string;
  info: string;
};

export const useStore = create<AppState>()(() => ({
  error: '',
  info: '',
}));

/** Shows a translated error in a snackbar. Wired to every query and mutation in main.tsx. */
export const showError = (error: unknown) => {
  useStore.setState({ error: errorMessage(error) });
};

export const showInfo = (info: string) => {
  useStore.setState({ info });
};

export const clearNotifications = () => {
  useStore.setState({ error: '', info: '' });
};
