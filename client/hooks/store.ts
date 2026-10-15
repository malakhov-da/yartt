import { create } from 'zustand';
import type { Tag } from '#shared/task.ts';
import { errorMessage } from '#client/i18n/errors.ts';

type AppState = {
  error: string;
  info: string;
  /** Tags to put into the search in My day (a tag in My tags); it takes and clears them. */
  searchTags: Tag[] | null;
};

export const useStore = create<AppState>()(() => ({
  error: '',
  info: '',
  searchTags: null,
}));

/** Opens My day with the search narrowed to these tags. */
export const searchByTags = (tags: Tag[]) => {
  useStore.setState({ searchTags: tags });
};

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
