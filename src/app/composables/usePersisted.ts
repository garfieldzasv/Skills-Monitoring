import { shallowRef, type ShallowRef } from "vue";

export interface Persisted<T> {
  /** Immutable snapshot; replaced (never mutated) on every change. */
  state: Readonly<ShallowRef<T>>;
  /** Applies a change to a deep copy, validates it, publishes and schedules a save. */
  update(mutate: (draft: T) => void): void;
  replace(next: T): void;
}

interface PersistedOptions<T> {
  storageKey: string;
  load: () => T;
  save: (value: T) => void;
  validate: (value: unknown) => T;
  debounceMs?: number;
}

/**
 * Shared persistence for settings-like state: debounced writes, and reload when another
 * window (overlay ↔ settings page, same origin) writes the same key.
 */
export function createPersisted<T>(options: PersistedOptions<T>): Persisted<T> {
  const state = shallowRef<T>(options.load());
  let timer: number | undefined;
  let lastWritten = "";

  const flush = () => {
    timer = undefined;
    options.save(state.value);
    lastWritten = JSON.stringify(state.value);
  };

  const schedule = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(flush, options.debounceMs ?? 200);
  };

  window.addEventListener("storage", (e) => {
    if (e.key !== options.storageKey || e.newValue === null || e.newValue === lastWritten) return;
    state.value = options.load();
  });
  window.addEventListener("beforeunload", () => {
    if (timer !== undefined) flush();
  });

  return {
    state,
    update(mutate) {
      const draft = structuredClone(state.value) as T;
      mutate(draft);
      state.value = options.validate(draft);
      schedule();
    },
    replace(next) {
      state.value = options.validate(next);
      schedule();
    },
  };
}
