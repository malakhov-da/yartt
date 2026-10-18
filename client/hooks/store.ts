import { create } from 'zustand';
import type { Tag } from '#shared/task.ts';
import { errorMessage } from '#client/i18n/errors.ts';

type AppState = {
  error: string;
  info: string;
  /** Tags to put into the search in My day (a tag in My tags); it takes and clears them. */
  searchTags: Tag[] | null;
  /** Grows on every click of the bell: the TODO block scrolls into view and flashes its title. */
  todoFocus: number;
};

export const useStore = create<AppState>()(() => ({
  error: '',
  info: '',
  searchTags: null,
  todoFocus: 0,
}));

/** Shows the TODO block: scrolled into view, its title flashing — the bell, even when already in My day. */
export const focusTodo = () => {
  useStore.setState((s) => ({ todoFocus: s.todoFocus + 1 }));
};

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
