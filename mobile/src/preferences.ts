import * as SecureStore from 'expo-secure-store';

const THEME_MODE_SETTING = 'gather-mind-theme-mode-v1';
const DAILY_STATUS_ENABLED_SETTING = 'gather-mind-daily-status-enabled-v1';
const DAILY_STATUS_MINUTES_SETTING = 'gather-mind-daily-status-minutes-v1';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const THEME_MODES = ['system', 'light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export async function loadThemeMode(): Promise<ThemeMode> {
  const stored = await SecureStore.getItemAsync(THEME_MODE_SETTING, SECURE_STORE_OPTIONS);
  return isThemeMode(stored) ? stored : 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  if (!isThemeMode(mode)) throw new Error('Unsupported appearance preference.');
  await SecureStore.setItemAsync(THEME_MODE_SETTING, mode, SECURE_STORE_OPTIONS);
}

export type DailyStatusPreference = { enabled: boolean; minutes: number };

export async function loadDailyStatusPreference(defaultMinutes: number): Promise<DailyStatusPreference> {
  const [storedEnabled, storedMinutes] = await Promise.all([
    SecureStore.getItemAsync(DAILY_STATUS_ENABLED_SETTING, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DAILY_STATUS_MINUTES_SETTING, SECURE_STORE_OPTIONS),
  ]);
  const parsedMinutes = storedMinutes === null ? defaultMinutes : Number(storedMinutes);
  return {
    enabled: storedEnabled === 'true',
    minutes: Number.isInteger(parsedMinutes) && parsedMinutes >= 0 && parsedMinutes < 24 * 60 ? parsedMinutes : defaultMinutes,
  };
}

export async function saveDailyStatusEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(DAILY_STATUS_ENABLED_SETTING, String(enabled), SECURE_STORE_OPTIONS);
}

export async function saveDailyStatusMinutes(minutes: number): Promise<void> {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) throw new Error('Unsupported daily status time.');
  await SecureStore.setItemAsync(DAILY_STATUS_MINUTES_SETTING, String(minutes), SECURE_STORE_OPTIONS);
}
