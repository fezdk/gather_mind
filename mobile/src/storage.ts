import Storage from 'expo-sqlite/kv-store';
import { AppState, createEmptyState } from './model';

const STORAGE_KEY = 'gather-mind-native-state-v1';

type LegacyState = Omit<AppState, 'version' | 'tasks'> & { version: 1 };

export async function loadState(): Promise<AppState> {
  try {
    const raw = await Storage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw) as AppState | LegacyState;
      if (state.version === 2 && Array.isArray(state.thoughts) && Array.isArray(state.appointments) && Array.isArray(state.tasks)) return state;
      if (state.version === 1 && Array.isArray(state.thoughts) && Array.isArray(state.appointments)) {
        const migrated: AppState = { ...state, version: 2, tasks: [] };
        await saveState(migrated);
        return migrated;
      }
    }
  } catch (error) {
    console.warn('Could not load saved Gather Mind data', error);
  }
  const empty = createEmptyState();
  await saveState(empty);
  return empty;
}

export async function saveState(state: AppState) {
  await Storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearState() {
  await Storage.removeItem(STORAGE_KEY);
}
