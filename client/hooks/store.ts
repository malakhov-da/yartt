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
  /**
   * By task: up to which comment (its moment, ms) the review's table was
   * scrolled to the end. Kept in the page only: reviewed_at is not a read
   * receipt (decision 94).
   */
  reviewRead: Record<number, number>;
};

export const useStore = create<AppState>()(() => ({
  error: '',
  info: '',
  searchTags: null,
  todoFocus: 0,
  reviewRead: {},
}));

/** Shows the TODO block: scrolled into view, its title flashing — the bell, even when already in My day. */
export const focusTodo = () => {
  useStore.setState((s) => ({ todoFocus: s.todoFocus + 1 }));
};

/** The new comments of a task's review are read up to this moment. */
export const markReviewRead = (taskId: number, at: Date) => {
  useStore.setState((s) => ({ reviewRead: { ...s.reviewRead, [taskId]: Math.max(s.reviewRead[taskId] ?? 0, at.getTime()) } }));
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
