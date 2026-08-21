import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator, Alert, Animated, Appearance, AppState as NativeAppState, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Switch, Text, TextInput, useColorScheme, View, type LayoutChangeEvent, type TextInputProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AgendaItem, Appointment, AppState, DailyTask, EditorDraft, REMINDER_OPTIONS, Thought, dateKeyAfter,
  canPostponeTask, createEmptyState, createGoalFromThought, createTask, describeCountdown, groupUpcomingAppointments, localDateFromKey, localDateKey, makeId, relatedThoughts, reminderLabel, reminderTime, removeLegacySeedData, searchThoughts, suggestedAppointments, suggestedTags,
  taskCarryOverLabel, taskPostponeLimit, tasksForToday, tasksForTomorrow, tasksScheduledAhead, toggleTaskCompletion, upcomingAppointments, updateTaskSchedule,
  type AppointmentSuggestion, type TaskRecurrence, type ThoughtRelation,
} from './src/model';
import { clearState as clearStoredState, closeStateStorage, loadEditorDraft, loadState, saveEditorDraft, saveState } from './src/storage';
import {
  DAILY_STATUS_KIND, cancelReminder, clearDailyGoalStatus, configureNotifications, notificationsEnabled,
  reconcileDailyGoalStatus, reconcileReminders, requestNotificationPermission, scheduleReminder,
} from './src/notifications';
import {
  APP_LOCK_DELAYS_MS, type AppLockDelayMs,
  authenticationErrorMessage, authenticateWithBiometrics, biometricAvailability,
  loadAppLockDelayMs, loadAppLockEnabled, saveAppLockDelayMs, saveAppLockEnabled,
} from './src/security';
import {
  authenticationCanComplete, awayDurationRequiresLock, clearPrivateNotifications, runAfterReminderCancellation,
  settingChangeStayedForeground,
} from './src/privacy-operations';
import { scrollOffsetForVisibleInput, visibleViewportBottom } from './src/keyboard-layout';
import {
  loadDailyStatusPreference, loadThemeMode, saveDailyStatusEnabled, saveDailyStatusMinutes, saveThemeMode, type ThemeMode,
} from './src/preferences';
import { DEFAULT_DAILY_STATUS_MINUTES, dateAtLocalMinutes } from './src/daily-status';

type Tab = 'today' | 'thoughts' | 'appointments';
type PickerMode = 'date' | 'time' | null;
type Notice = { text: string; actionLabel?: string; onAction?: () => void };
type LockStatus = 'checking' | 'locked' | 'unlocking' | 'unlocked';

type ThemeColors = {
  ink: string; muted: string; paper: string; card: string; sage: string; accentSolid: string; accentText: string;
  sagePale: string; peach: string; yellow: string; lavender: string; blue: string; line: string; danger: string;
  dangerLine: string; moved: string; white: string; handle: string; toastBackground: string; toastText: string;
  stress1: string; stress2: string; stress3: string; stress4: string; stress5: string;
};
const LIGHT_COLORS: ThemeColors = {
  ink: '#25322F', muted: '#6D7873', paper: '#F7F3EA', card: '#FFFDF8', sage: '#779887',
  accentSolid: '#416555', accentText: '#416555', sagePale: '#DFE9DF', peach: '#F7E1D3', yellow: '#EFE2AC',
  lavender: '#DED8EB', blue: '#D8E9E9', line: '#DEDFD7', danger: '#9E5148', dangerLine: '#9E51484D',
  moved: '#8E4F43', white: '#FFFFFF', handle: '#D4D2CA', toastBackground: '#25322F', toastText: '#FFFFFF',
  stress1: '#F1DB9B', stress2: '#F0BEA6', stress3: '#E3A091', stress4: '#C77668', stress5: '#B6655B',
};
const DARK_COLORS: ThemeColors = {
  ink: '#E7ECE8', muted: '#A8B3AD', paper: '#111815', card: '#1A2420', sage: '#789D89',
  accentSolid: '#4D715F', accentText: '#9CCCB1', sagePale: '#26382F', peach: '#3B2A24', yellow: '#3B351F',
  lavender: '#302D3D', blue: '#21373A', line: '#34423B', danger: '#F09A90', dangerLine: '#F09A9060',
  moved: '#F0AA9B', white: '#FFFFFF', handle: '#637069', toastBackground: '#27342E', toastText: '#FFFFFF',
  stress1: '#4A4126', stress2: '#4C352C', stress3: '#56332F', stress4: '#623630', stress5: '#713B35',
};
type AppTheme = { C: ThemeColors; s: ReturnType<typeof makeStyles>; bubbles: string[]; isDark: boolean };
const LIGHT_THEME: AppTheme = { C: LIGHT_COLORS, s: makeStyles(LIGHT_COLORS), bubbles: [LIGHT_COLORS.sagePale, LIGHT_COLORS.peach, LIGHT_COLORS.yellow, LIGHT_COLORS.lavender, LIGHT_COLORS.blue], isDark: false };
const AppThemeContext = createContext<AppTheme>(LIGHT_THEME);
function useAppTheme() { return useContext(AppThemeContext); }
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const taskDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
function formatDailyStatusTime(minutes: number) {
  return shortTime.format(dateAtLocalMinutes(localDateKey(), minutes));
}
const APP_LOCK_DELAY_OPTIONS: ReadonlyArray<{ value: AppLockDelayMs; label: string }> = [
  { value: APP_LOCK_DELAYS_MS[0], label: 'Immediately' },
  { value: APP_LOCK_DELAYS_MS[1], label: 'After 1 minute' },
  { value: APP_LOCK_DELAYS_MS[2], label: 'After 5 minutes' },
  { value: APP_LOCK_DELAYS_MS[3], label: 'After 15 minutes' },
];
const THEME_MODE_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'Follow device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];
const TASK_RECURRENCE_OPTIONS: ReadonlyArray<{ value: TaskRecurrence; title: string; description: string }> = [
  { value: 'once', title: 'Just this time', description: 'Can be moved to tomorrow as needed.' },
  { value: 'daily', title: 'Daily essential', description: 'Returns each day and cannot be moved.' },
  { value: 'weekly', title: 'Once a week', description: 'Returns weekly · up to 2 moves.' },
  { value: 'monthly', title: 'Once a month', description: 'Returns monthly · up to 5 moves.' },
];

export default function App() {
  const deviceScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  useEffect(() => {
    void loadThemeMode().then(setThemeMode).catch((error) => console.warn('Could not load appearance preference', error));
  }, []);
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? null : themeMode);
  }, [themeMode]);
  const resolvedScheme = themeMode === 'system' ? deviceScheme === 'dark' ? 'dark' : 'light' : themeMode;
  const theme = useMemo<AppTheme>(() => {
    const C = resolvedScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    return { C, s: makeStyles(C), bubbles: [C.sagePale, C.peach, C.yellow, C.lavender, C.blue], isDark: resolvedScheme === 'dark' };
  }, [resolvedScheme]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.C.paper).catch((error) => console.warn('Could not update system background color', error));
  }, [theme.C.paper]);
  function changeThemeMode(mode: ThemeMode) {
    const previous = themeMode;
    setThemeMode(mode);
    void saveThemeMode(mode).catch((error) => {
      console.warn('Could not save appearance preference', error);
      setThemeMode((current) => current === mode ? previous : current);
      Alert.alert('Appearance was not saved', 'Gather Mind could not save this setting on the phone.');
    });
  }
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><AppThemeContext.Provider value={theme}><GatherMindApp themeMode={themeMode} onThemeModeChange={changeThemeMode} /></AppThemeContext.Provider></SafeAreaProvider>;
}

function GatherMindApp({ themeMode, onThemeModeChange }: { themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const { C, s, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' ? Math.max(insets.top, NativeStatusBar.currentHeight ?? 0) : insets.top;
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thoughtModal, setThoughtModal] = useState(false);
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingPostponeId, setPendingPostponeId] = useState<string | null>(null);
  const [appointmentModal, setAppointmentModal] = useState(false);
  const [reminderModal, setReminderModal] = useState(false);
  const [privacyModal, setPrivacyModal] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [dailyStatusEnabled, setDailyStatusEnabledState] = useState(false);
  const dailyStatusEnabledRef = useRef(false);
  const [dailyStatusMinutes, setDailyStatusMinutesState] = useState(DEFAULT_DAILY_STATUS_MINUTES);
  const dailyStatusMinutesRef = useRef(DEFAULT_DAILY_STATUS_MINUTES);
  const [dailyStatusBusy, setDailyStatusBusy] = useState(false);
  const dailyStatusBusyRef = useRef(false);
  const [appLockEnabled, setAppLockEnabledState] = useState(false);
  const appLockEnabledRef = useRef(false);
  const [appLockDelayMs, setAppLockDelayMsState] = useState<AppLockDelayMs>(0);
  const appLockDelayMsRef = useRef<AppLockDelayMs>(0);
  const [lockStatus, setLockStatus] = useState<LockStatus>('checking');
  const lockStatusRef = useRef<LockStatus>('checking');
  const [lockSettingBusy, setLockSettingBusy] = useState(false);
  const lockSettingBusyRef = useRef(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const authenticatingRef = useRef(false);
  const backgroundedDuringAuthenticationRef = useRef(false);
  const backgroundTransitionRef = useRef(0);
  const authenticationAttemptRef = useRef(0);
  const [authenticationCover, setAuthenticationCover] = useState(false);
  const [awayCover, setAwayCover] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const lockDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const lockGenerationRef = useRef(0);
  const hydrationPromiseRef = useRef<Promise<void> | null>(null);
  const storageClosingRef = useRef<Promise<void> | null>(null);
  const deletingAllRef = useRef(false);
  const activeContentMutationsRef = useRef(0);
  const contentMutationWaitersRef = useRef<Array<() => void>>([]);
  const editorDraftRef = useRef<EditorDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateLockStatus(status: LockStatus) {
    lockStatusRef.current = status;
    setLockStatus(status);
  }

  function beginContentMutation(): (() => void) | null {
    if (deletingAllRef.current) return null;
    activeContentMutationsRef.current += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      activeContentMutationsRef.current = Math.max(0, activeContentMutationsRef.current - 1);
      if (activeContentMutationsRef.current === 0) {
        const waiters = contentMutationWaitersRef.current.splice(0);
        waiters.forEach((resolve) => resolve());
      }
    };
  }

  function waitForContentMutations(): Promise<void> {
    if (activeContentMutationsRef.current === 0) return Promise.resolve();
    return new Promise((resolve) => contentMutationWaitersRef.current.push(resolve));
  }

  function updateEditorDraft(draft: EditorDraft) {
    editorDraftRef.current = draft;
  }

  function discardEditorDraft() {
    editorDraftRef.current = null;
    void saveEditorDraft(null).catch((error) => console.warn('Could not clear encrypted editor draft', error));
  }

  function waitUntilAppIsActive(timeoutMs = 5000, waitThroughBackground = false): Promise<boolean> {
    if (NativeAppState.currentState === 'active') return Promise.resolve(true);
    if (NativeAppState.currentState === 'background' && !waitThroughBackground) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let subscription: { remove: () => void } | null = null;
      const finish = (active: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        subscription?.remove();
        resolve(active);
      };
      subscription = NativeAppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') finish(true);
        else if (nextState === 'background' && !waitThroughBackground) finish(false);
      });
      timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  async function hydrateContent(): Promise<void> {
    if (hydrationPromiseRef.current) return hydrationPromiseRef.current;
    const generation = lockGenerationRef.current;
    const hydration = (async () => {
      const stored = await loadState();
      const legacyReminderIds = stored.appointments
        .filter((appointment) => appointment.id === 'appointment_demo_doctor')
        .map((appointment) => appointment.notificationId);
      const legacyReminderCleanup = await Promise.allSettled(legacyReminderIds.map(cancelReminder));
      const legacyReminderErrors = legacyReminderCleanup.filter((result) => result.status === 'rejected');
      if (legacyReminderErrors.length) console.warn('Could not remove a legacy sample reminder', legacyReminderErrors);
      const cleaned = removeLegacySeedData(stored);
      const appointments = await reconcileReminders(cleaned.appointments);
      const hydrated = appointments === cleaned.appointments ? cleaned : { ...cleaned, appointments };
      if (hydrated !== stored) await saveState(hydrated);
      const storedDraft = await loadEditorDraft();
      const editorDraft = editorDraftRef.current ?? storedDraft;
      const remindersAreOn = await notificationsEnabled();
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const responseData = lastResponse?.notification.request.content.data;
      const appointmentId = responseData?.appointmentId;
      const openedDailyStatus = responseData?.kind === DAILY_STATUS_KIND;
      await reconcileDailyGoalStatus(
        hydrated.tasks,
        dailyStatusEnabledRef.current,
        dailyStatusMinutesRef.current,
      ).catch((error) => console.warn('Could not refresh quiet daily status', error));

      if (!mountedRef.current || generation !== lockGenerationRef.current || lockStatusRef.current !== 'unlocked') return;
      stateRef.current = hydrated;
      editorDraftRef.current = editorDraft;
      setState(hydrated);
      setNotificationsOn(remindersAreOn);
      setStartupError(null);
      if (editorDraft?.kind === 'thought') {
        setEditingThoughtId(editorDraft.itemId);
        setThoughtModal(true);
        setTab('thoughts');
      } else if (editorDraft?.kind === 'task') {
        setEditingTaskId(editorDraft.itemId);
        setTaskModal(true);
        setTab('today');
      } else if (editorDraft?.kind === 'appointment') {
        setSelectedId(editorDraft.itemId);
        setAppointmentModal(true);
        setTab('appointments');
      } else if (editorDraft?.kind === 'agenda') {
        setSelectedId(editorDraft.appointmentId);
        setTab('appointments');
      } else if (typeof appointmentId === 'string') {
        setSelectedId(appointmentId);
        setTab('appointments');
        await Notifications.clearLastNotificationResponse();
      } else if (openedDailyStatus) {
        setSelectedId(null);
        setTab('today');
        await Notifications.clearLastNotificationResponse();
      }
    })();
    hydrationPromiseRef.current = hydration;
    try {
      await hydration;
    } finally {
      if (hydrationPromiseRef.current === hydration) hydrationPromiseRef.current = null;
    }
  }

  function closeStorageAfter(pending?: Promise<unknown>) {
    const previousClose = storageClosingRef.current;
    const closing = (async () => {
      await previousClose?.catch(() => undefined);
      await pending?.catch(() => undefined);
      await closeStateStorage();
    })();
    storageClosingRef.current = closing;
    void closing.catch((error) => console.warn('Could not close encrypted local storage', error)).finally(() => {
      if (storageClosingRef.current === closing) storageClosingRef.current = null;
    });
  }

  function clearLockDelayTimer() {
    if (lockDelayTimerRef.current) clearTimeout(lockDelayTimerRef.current);
    lockDelayTimerRef.current = null;
  }

  function clearPendingBackgroundLock() {
    clearLockDelayTimer();
    backgroundedAtRef.current = null;
    setAwayCover(false);
  }

  function beginBackgroundLockCountdown() {
    clearLockDelayTimer();
    const backgroundedAt = Date.now();
    backgroundedAtRef.current = backgroundedAt;
    setAwayCover(true);
    const delayMs = appLockDelayMsRef.current;
    if (delayMs === 0) {
      lockApp();
      return;
    }
    lockDelayTimerRef.current = setTimeout(() => {
      lockDelayTimerRef.current = null;
      if (backgroundedAtRef.current !== backgroundedAt || NativeAppState.currentState !== 'background') return;
      lockApp();
    }, delayMs);
  }

  function lockApp(force = false) {
    clearPendingBackgroundLock();
    if ((!appLockEnabledRef.current && !force) || lockStatusRef.current === 'locked') return;
    const draftSaving = editorDraftRef.current
      ? saveEditorDraft(editorDraftRef.current).catch((error) => console.warn('Could not save encrypted editor draft', error))
      : undefined;
    authenticationAttemptRef.current += 1;
    lockGenerationRef.current += 1;
    updateLockStatus('locked');
    stateRef.current = null;
    setState(null);
    setSelectedId(null);
    setThoughtModal(false);
    setEditingThoughtId(null);
    setTaskModal(false);
    setEditingTaskId(null);
    setPendingPostponeId(null);
    setAppointmentModal(false);
    setReminderModal(false);
    setPrivacyModal(false);
    setNotice(null);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;

    closeStorageAfter(draftSaving ?? hydrationPromiseRef.current ?? undefined);
  }

  async function unlockApp(showFailure: boolean): Promise<void> {
    if (authenticatingRef.current) return;
    const generation = lockGenerationRef.current;
    const attemptId = authenticationAttemptRef.current + 1;
    authenticationAttemptRef.current = attemptId;
    updateLockStatus('unlocking');
    backgroundedDuringAuthenticationRef.current = false;
    authenticatingRef.current = true;
    let authenticated = false;
    try {
      const availability = await biometricAvailability();
      if (!availability.available) {
        updateLockStatus('locked');
        Alert.alert('Biometric unlock unavailable', availability.message);
        return;
      }
      const result = await authenticateWithBiometrics();
      if (!result.success) {
        updateLockStatus('locked');
        if (showFailure && result.error !== 'user_cancel' && result.error !== 'system_cancel') {
          Alert.alert('Could not unlock', authenticationErrorMessage(result.error));
        }
        return;
      }
      authenticated = true;
    } catch (error) {
      updateLockStatus('locked');
      if (showFailure) Alert.alert('Could not unlock', String(error));
      else throw error;
    } finally {
      authenticatingRef.current = false;
    }
    if (!authenticated) {
      backgroundedDuringAuthenticationRef.current = false;
      return;
    }
    await storageClosingRef.current?.catch(() => undefined);
    await waitUntilAppIsActive(5000, true);
    const canComplete = authenticationCanComplete({
      authenticated,
      appState: NativeAppState.currentState,
      attemptId,
      currentAttemptId: authenticationAttemptRef.current,
      generation,
      currentGeneration: lockGenerationRef.current,
      mounted: mountedRef.current,
      sawBackground: backgroundedDuringAuthenticationRef.current,
    });
    if (!canComplete) {
      if (appLockEnabledRef.current && lockStatusRef.current !== 'locked') lockApp();
      backgroundedDuringAuthenticationRef.current = false;
      return;
    }
    backgroundedDuringAuthenticationRef.current = false;
    updateLockStatus('unlocked');
    try {
      await hydrateContent();
    } catch (error) {
      if (mountedRef.current) setStartupError(String(error));
      if (showFailure) Alert.alert('Could not open local data', String(error));
    }
  }

  async function initialiseApp(): Promise<void> {
    // Read the persisted lock before any fallible startup work so retry can never fail open.
    const [enabled, delayMs, dailyStatus] = await Promise.all([
      loadAppLockEnabled(),
      loadAppLockDelayMs(),
      loadDailyStatusPreference(DEFAULT_DAILY_STATUS_MINUTES),
    ]);
    if (!mountedRef.current) return;
    appLockEnabledRef.current = enabled;
    setAppLockEnabledState(enabled);
    appLockDelayMsRef.current = delayMs;
    setAppLockDelayMsState(delayMs);
    dailyStatusEnabledRef.current = dailyStatus.enabled;
    setDailyStatusEnabledState(dailyStatus.enabled);
    dailyStatusMinutesRef.current = dailyStatus.minutes;
    setDailyStatusMinutesState(dailyStatus.minutes);
    await configureNotifications();
    if (!mountedRef.current) return;
    if (enabled) {
      updateLockStatus('locked');
      await unlockApp(false);
    } else {
      updateLockStatus('unlocked');
      await hydrateContent();
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    initialiseApp().catch((error) => {
      if (!mountedRef.current) return;
      setStartupError(String(error));
      Alert.alert('Could not start Gather Mind', String(error));
    });
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const appointmentId = data?.appointmentId;
      if (typeof appointmentId === 'string') {
        setSelectedId(appointmentId);
        setTab('appointments');
      } else if (data?.kind === DAILY_STATUS_KIND) {
        setSelectedId(null);
        setTab('today');
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') backgroundTransitionRef.current += 1;
      if (authenticatingRef.current) {
        if (nextState === 'background') {
          backgroundedDuringAuthenticationRef.current = true;
        }
        return;
      }
      if (nextState === 'active') {
        clearLockDelayTimer();
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (appLockEnabledRef.current && backgroundedAt !== null
          && awayDurationRequiresLock(backgroundedAt, Date.now(), appLockDelayMsRef.current)) {
          lockApp();
        } else {
          setAwayCover(false);
        }
        return;
      }
      // Cover the app before iOS captures its task-switcher snapshot. A
      // transient inactive state does not start the lock timeout.
      if (nextState === 'inactive' && appLockEnabledRef.current) {
        setAwayCover(true);
        return;
      }
      if (nextState !== 'background' || !appLockEnabledRef.current) return;
      beginBackgroundLockCountdown();
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    clearLockDelayTimer();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (privacyModal) { setPrivacyModal(false); return true; }
      if (reminderModal) { setReminderModal(false); return true; }
      if (appointmentModal) { closeAppointmentEditor(); return true; }
      if (thoughtModal) { closeThoughtEditor(); return true; }
      if (taskModal) { closeTaskEditor(); return true; }
      if (pendingPostponeId) { setPendingPostponeId(null); return true; }
      if (selectedId) { setSelectedId(null); return true; }
      if (tab !== 'today') { setTab('today'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [appointmentModal, pendingPostponeId, privacyModal, reminderModal, selectedId, tab, taskModal, thoughtModal]);

  function commit(next: AppState): boolean {
    if (deletingAllRef.current) return false;
    const tasksChanged = stateRef.current?.tasks !== next.tasks;
    const saving = saveState(next).catch((error) => Alert.alert('Could not save', String(error)));
    if (lockStatusRef.current === 'unlocked') {
      stateRef.current = next;
      setState(next);
    } else {
      stateRef.current = null;
      closeStorageAfter(saving);
    }
    if (tasksChanged) {
      void reconcileDailyGoalStatus(
        next.tasks,
        dailyStatusEnabledRef.current,
        dailyStatusMinutesRef.current,
        true,
      ).catch((error) => console.warn('Could not update quiet daily status', error));
    }
    return true;
  }

  function flash(text: string, onAction?: () => void, actionLabel = 'Undo') {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, onAction, actionLabel: onAction ? actionLabel : undefined });
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, onAction ? 4200 : 2600);
  }

  function runNoticeAction() {
    const action = notice?.onAction;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNotice(null);
    action?.();
  }

  async function changeProtectedLockSetting(promptMessage: string, persist: () => Promise<void>, successMessage: string) {
    if (lockSettingBusyRef.current) return;
    lockSettingBusyRef.current = true;
    setLockSettingBusy(true);
    backgroundedDuringAuthenticationRef.current = false;
    const generation = lockGenerationRef.current;
    const enabledBeforeChange = appLockEnabledRef.current;
    const attemptId = authenticationAttemptRef.current + 1;
    authenticationAttemptRef.current = attemptId;
    let authenticated = false;
    let settingPersisted = false;
    try {
      const availability = await biometricAvailability();
      if (!availability.available) {
        Alert.alert('Biometric unlock unavailable', availability.message);
        return;
      }
      setAuthenticationCover(true);
      authenticatingRef.current = true;
      const result = await authenticateWithBiometrics(promptMessage);
      if (!result.success) {
        if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
          Alert.alert('Could not change app lock', authenticationErrorMessage(result.error));
        }
        return;
      }
      authenticated = true;
      await waitUntilAppIsActive(5000, true);
      if (!authenticationCanComplete({
        authenticated,
        appState: NativeAppState.currentState,
        attemptId,
        currentAttemptId: authenticationAttemptRef.current,
        generation,
        currentGeneration: lockGenerationRef.current,
        mounted: mountedRef.current,
        sawBackground: backgroundedDuringAuthenticationRef.current,
      })) return;
      const backgroundEpochAfterAuthentication = backgroundTransitionRef.current;
      // The credential UI has finished. From here on, any background event is
      // a real app leave and must win over the asynchronous setting write.
      authenticatingRef.current = false;
      await persist();
      settingPersisted = true;
      if (!settingChangeStayedForeground(
        NativeAppState.currentState,
        backgroundEpochAfterAuthentication,
        backgroundTransitionRef.current,
      )) {
        lockApp(true);
      } else {
        flash(successMessage);
      }
    } catch (error) {
      Alert.alert('Could not change app lock', String(error));
    } finally {
      authenticatingRef.current = false;
      setAuthenticationCover(false);
      lockSettingBusyRef.current = false;
      setLockSettingBusy(false);
      if (!settingPersisted && enabledBeforeChange) {
        const backgrounded = backgroundedDuringAuthenticationRef.current;
        if (backgrounded || NativeAppState.currentState !== 'active') lockApp(true);
      }
      backgroundedDuringAuthenticationRef.current = false;
    }
  }

  async function changeAppLock(enabled: boolean) {
    if (enabled === appLockEnabledRef.current) return;
    await changeProtectedLockSetting(
      enabled ? 'Turn on Gather Mind lock' : 'Turn off Gather Mind lock',
      async () => {
        await saveAppLockEnabled(enabled);
        appLockEnabledRef.current = enabled;
        setAppLockEnabledState(enabled);
        if (!enabled) clearPendingBackgroundLock();
      },
      enabled ? 'Gather Mind app lock is on' : 'Gather Mind app lock is off',
    );
  }

  async function changeAppLockDelay(delayMs: AppLockDelayMs) {
    if (delayMs === appLockDelayMsRef.current) return;
    const label = APP_LOCK_DELAY_OPTIONS.find((option) => option.value === delayMs)?.label.toLowerCase() ?? 'after the selected delay';
    await changeProtectedLockSetting(
      'Change Gather Mind lock delay',
      async () => {
        await saveAppLockDelayMs(delayMs);
        appLockDelayMsRef.current = delayMs;
        setAppLockDelayMsState(delayMs);
      },
      `Gather Mind will lock ${label}`,
    );
  }

  function restoreTaskSnapshot(previous: DailyTask) {
    const current = stateRef.current;
    if (!current || !current.tasks.some((task) => task.id === previous.id)) return;
    commit({ ...current, tasks: current.tasks.map((task) => task.id === previous.id ? previous : task) });
    flash('Change undone');
  }

  async function enableReminders() {
    const finishMutation = beginContentMutation();
    if (!finishMutation) return false;
    try {
      const allowed = await requestNotificationPermission();
      setNotificationsOn(allowed);
      if (!allowed) {
        Alert.alert('Reminders are off', 'Notifications were not allowed. You can enable them later in your phone settings.');
        return false;
      }
      if (state) {
        const appointments = await reconcileReminders(state.appointments);
        if (appointments !== state.appointments && !commit({ ...state, appointments })) return false;
      }
      if (dailyStatusEnabledRef.current && stateRef.current) {
        await reconcileDailyGoalStatus(
          stateRef.current.tasks,
          true,
          dailyStatusMinutesRef.current,
          true,
        );
      }
      if (!deletingAllRef.current) flash('Appointment reminders are on');
      return true;
    } catch (error) {
      Alert.alert('Could not enable reminders', String(error));
      return false;
    } finally {
      finishMutation();
    }
  }

  async function changeDailyStatus(enabled: boolean) {
    if (dailyStatusBusyRef.current || enabled === dailyStatusEnabledRef.current) return;
    dailyStatusBusyRef.current = true;
    setDailyStatusBusy(true);
    try {
      if (enabled) {
        const allowed = notificationsOn || await requestNotificationPermission();
        setNotificationsOn(allowed);
        if (!allowed) {
          Alert.alert('Quiet daily status is off', 'Notifications were not allowed. You can enable them in your phone settings and try again.');
          return;
        }
      }
      await saveDailyStatusEnabled(enabled);
      dailyStatusEnabledRef.current = enabled;
      setDailyStatusEnabledState(enabled);
      if (enabled && stateRef.current) {
        await reconcileDailyGoalStatus(stateRef.current.tasks, true, dailyStatusMinutesRef.current, true);
      } else if (!enabled) {
        await clearDailyGoalStatus();
      }
      flash(enabled ? 'Quiet daily status is on' : 'Quiet daily status is off');
    } catch (error) {
      Alert.alert('Could not change quiet daily status', String(error));
    } finally {
      dailyStatusBusyRef.current = false;
      setDailyStatusBusy(false);
    }
  }

  async function changeDailyStatusTime(minutes: number) {
    if (dailyStatusBusyRef.current || minutes === dailyStatusMinutesRef.current) return;
    dailyStatusBusyRef.current = true;
    setDailyStatusBusy(true);
    try {
      await saveDailyStatusMinutes(minutes);
      dailyStatusMinutesRef.current = minutes;
      setDailyStatusMinutesState(minutes);
      if (dailyStatusEnabledRef.current && stateRef.current) {
        await reconcileDailyGoalStatus(stateRef.current.tasks, true, minutes, true);
      }
      flash(`Quiet status will appear after ${formatDailyStatusTime(minutes)}`);
    } catch (error) {
      Alert.alert('Could not change quiet status time', String(error));
    } finally {
      dailyStatusBusyRef.current = false;
      setDailyStatusBusy(false);
    }
  }

  function openAppointmentEditor() {
    discardEditorDraft();
    setAppointmentModal(true);
  }

  function closeAppointmentEditor() {
    discardEditorDraft();
    setAppointmentModal(false);
  }

  async function upsertAppointment(input: Omit<Appointment, 'notificationId' | 'createdAt' | 'agenda'> & { existing?: Appointment }) {
    if (!state) return;
    if (Date.parse(input.startsAt) <= Date.now()) {
      Alert.alert('Choose a future time', 'The appointment time has already passed.');
      return;
    }
    if (input.reminderMinutes && reminderTime(input.startsAt, input.reminderMinutes).getTime() <= Date.now()) {
      Alert.alert('That reminder time has passed', 'Choose a shorter reminder interval for this appointment.');
      return;
    }

    const finishMutation = beginContentMutation();
    if (!finishMutation) return;
    try {
      const existing = input.existing;
      let appointment: Appointment = {
        id: input.id, title: input.title, startsAt: input.startsAt, location: input.location,
        reminderMinutes: input.reminderMinutes, notificationId: existing?.notificationId ?? null,
        createdAt: existing?.createdAt ?? new Date().toISOString(), agenda: existing?.agenda ?? [],
      };
      if (appointment.reminderMinutes > 0) {
        let allowed = notificationsOn;
        if (!allowed) {
          allowed = await requestNotificationPermission();
          setNotificationsOn(allowed);
        }
        if (allowed) appointment = { ...appointment, notificationId: await scheduleReminder(appointment) };
        else appointment = await runAfterReminderCancellation(appointment.notificationId, cancelReminder, () => ({
          ...appointment, reminderMinutes: 0, notificationId: null,
        }));
      } else {
        appointment = await runAfterReminderCancellation(appointment.notificationId, cancelReminder, () => ({
          ...appointment, notificationId: null,
        }));
      }
      const appointments = existing
        ? state.appointments.map((item) => item.id === appointment.id ? appointment : item)
        : [...state.appointments, appointment];
      if (!commit({ ...state, appointments })) return;
      discardEditorDraft();
      setAppointmentModal(false);
      setSelectedId(appointment.id);
      setTab('appointments');
      flash(existing ? 'Appointment and reminder updated' : 'Appointment and reminder saved');
    } catch (error) {
      Alert.alert('Could not save appointment', String(error));
    } finally {
      finishMutation();
    }
  }

  async function deleteAppointment(appointment: Appointment) {
    if (!state) return;
    const finishMutation = beginContentMutation();
    if (!finishMutation) return;
    try {
      const next = await runAfterReminderCancellation(appointment.notificationId, cancelReminder, () => ({
        ...state,
        appointments: state.appointments.filter((item) => item.id !== appointment.id),
        thoughts: state.thoughts.map((thought) => thought.appointmentId === appointment.id ? { ...thought, appointmentId: '' } : thought),
      }));
      if (!commit(next)) return;
      setSelectedId(null);
      flash('Appointment and reminder deleted');
    } catch (error) {
      Alert.alert('Could not delete appointment', `Its reminder could not be removed, so the appointment was kept. ${String(error)}`);
    } finally {
      finishMutation();
    }
  }

  function openThought(thought?: Thought) {
    discardEditorDraft();
    setEditingThoughtId(thought?.id ?? null);
    setThoughtModal(true);
  }

  function closeThoughtEditor() {
    discardEditorDraft();
    setThoughtModal(false);
    setEditingThoughtId(null);
  }

  function saveThought(input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, existing?: Thought) {
    if (!state) return;
    const thought: Thought = existing
      ? { ...existing, ...input }
      : { id: makeId('thought'), ...input, createdAt: new Date().toISOString() };
    const thoughts = existing
      ? state.thoughts.map((item) => item.id === thought.id ? thought : item)
      : [thought, ...state.thoughts];
    commit({ ...state, thoughts });
    discardEditorDraft();
    setThoughtModal(false);
    setEditingThoughtId(null);
    flash(existing ? 'Thought updated' : 'Thought safely caught');
  }

  function turnThoughtIntoGoal(input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, thought: Thought) {
    if (!state || !input.text.trim()) return;
    const today = localDateKey();
    const alreadyLinked = state.tasks.some((task) => task.sourceThoughtId === thought.id && (!task.completedOn || task.completedOn === today));
    if (alreadyLinked) {
      Alert.alert('Already a goal', 'This thought already has an open or completed goal for today.');
      return;
    }
    const updatedThought = { ...thought, ...input, text: input.text.trim() };
    const goal = createGoalFromThought(updatedThought, today);
    if (!commit({
      ...state,
      thoughts: state.thoughts.map((item) => item.id === thought.id ? updatedThought : item),
      tasks: [...state.tasks, goal],
    })) return;
    discardEditorDraft();
    setThoughtModal(false);
    setEditingThoughtId(null);
    setTab('today');
    flash('Added to today · original thought kept', () => {
      const current = stateRef.current;
      if (!current || !current.tasks.some((task) => task.id === goal.id)) return;
      commit({ ...current, tasks: current.tasks.filter((task) => task.id !== goal.id) });
      flash('Goal removed · thought kept');
    });
  }

  function deleteThought(thought: Thought) {
    if (!state) return;
    const hasLinkedGoal = state.tasks.some((task) => task.sourceThoughtId === thought.id);
    Alert.alert('Remove this thought?', `This thought will be removed from Thoughts and any linked appointment.${hasLinkedGoal ? ' Goals made from it will be kept.' : ''}`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        commit({
          ...state,
          thoughts: state.thoughts.filter((item) => item.id !== thought.id),
          tasks: state.tasks.map((task) => task.sourceThoughtId === thought.id ? { ...task, sourceThoughtId: undefined } : task),
        });
        discardEditorDraft();
        setThoughtModal(false);
        setEditingThoughtId(null);
        flash('Thought removed');
      } },
    ]);
  }

  function openTask(task?: DailyTask) {
    discardEditorDraft();
    setEditingTaskId(task?.id ?? null);
    setTaskModal(true);
  }

  function closeTaskEditor() {
    discardEditorDraft();
    setTaskModal(false);
    setEditingTaskId(null);
  }

  function saveTask(title: string, recurrence: TaskRecurrence, scheduledFor: string, existing?: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    let task: DailyTask;
    if (!existing) {
      task = createTask(title, recurrence, scheduledFor);
    } else {
      task = { ...updateTaskSchedule(existing, recurrence, scheduledFor, today), title };
    }
    const tasks = existing
      ? state.tasks.map((item) => item.id === task.id ? task : item)
      : [...state.tasks, task];
    commit({ ...state, tasks });
    discardEditorDraft();
    setTaskModal(false);
    setEditingTaskId(null);
    const scheduledAhead = !existing && recurrence !== 'once' && task.scheduledFor > today;
    flash(existing ? 'Goal updated' : scheduledAhead ? 'Goal scheduled' : recurrence === 'daily' ? 'Daily essential added' : recurrence === 'weekly' ? 'Weekly goal added' : recurrence === 'monthly' ? 'Monthly goal added' : 'Today’s goal added');
  }

  function toggleTask(task: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    const wasDone = task.completedOn === today;
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? toggleTaskCompletion(item, today) : item) });
    flash(wasDone ? 'Goal reopened' : 'Goal completed', () => restoreTaskSnapshot(task));
  }

  function postponeTask(task: DailyTask) {
    if (!state) return;
    if (task.recurrence === 'daily') {
      Alert.alert('This stays on today’s list', 'Daily essentials cannot be moved to tomorrow. You can still check it off when it is done.');
      return;
    }
    if (!canPostponeTask(task)) {
      const limit = taskPostponeLimit(task.recurrence);
      Alert.alert('Move limit reached', `This ${taskRecurrenceName(task.recurrence).toLowerCase()} goal can be moved ${limit} times per occurrence. It will stay visible until you complete it.`);
      return;
    }
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, scheduledFor: dateKeyAfter(localDateKey(), 1), completedOn: null, completedOccurrence: undefined, offsetCount: item.offsetCount + 1 } : item) });
    setPendingPostponeId(null);
    flash('Moved to tomorrow', () => restoreTaskSnapshot(task));
  }

  function requestPostponeTask(task: DailyTask) {
    if (task.recurrence === 'daily') {
      Alert.alert('This stays on today’s list', 'Daily essentials cannot be moved to tomorrow. You can still check it off when it is done.');
      return;
    }
    if (!canPostponeTask(task)) {
      const limit = taskPostponeLimit(task.recurrence);
      Alert.alert('Move limit reached', `This ${taskRecurrenceName(task.recurrence).toLowerCase()} goal has used all ${limit} moves for this occurrence. It will stay visible until you complete it.`);
      return;
    }
    setPendingPostponeId(task.id);
  }

  function restoreTask(task: DailyTask) {
    if (!state) return;
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, scheduledFor: localDateKey(), completedOn: null, completedOccurrence: undefined, offsetCount: Math.max(0, item.offsetCount - 1) } : item) });
    flash('Brought back to today', () => restoreTaskSnapshot(task));
  }

  function deleteTask(task: DailyTask) {
    if (!state) return;
    Alert.alert('Remove this goal?', task.recurrence === 'once' ? 'This goal will be removed.' : `This ${taskRecurrenceName(task.recurrence).toLowerCase()} goal and all its future occurrences will be removed.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        commit({ ...state, tasks: state.tasks.filter((item) => item.id !== task.id) });
        discardEditorDraft();
        setTaskModal(false);
        setEditingTaskId(null);
        flash('Goal removed');
      } },
    ]);
  }

  async function deleteAllData() {
    if (deletingAllRef.current) return;
    deletingAllRef.current = true;
    let reminderCleanupFailed = false;
    try {
      // Let already-started reminder mutations settle, then make cancellation and clearing final.
      await waitForContentMutations();
      const notificationErrors = await clearPrivateNotifications({
        cancelScheduled: () => Notifications.cancelAllScheduledNotificationsAsync(),
        dismissDelivered: () => Notifications.dismissAllNotificationsAsync(),
        clearLastResponse: () => Notifications.clearLastNotificationResponse(),
      });
      if (notificationErrors.length) {
        reminderCleanupFailed = true;
        console.warn('Could not remove every notification during data deletion', notificationErrors);
      }
      try {
        // Wait behind any in-flight quiet-status refresh, then remove anything it may have scheduled.
        await clearDailyGoalStatus();
      } catch (error) {
        reminderCleanupFailed = true;
        console.warn('Could not finish removing quiet daily status during data deletion', error);
      }
      await clearStoredState();
      editorDraftRef.current = null;
      const empty = createEmptyState();
      if (lockStatusRef.current === 'unlocked') {
        stateRef.current = empty;
        setState(empty);
      } else {
        stateRef.current = null;
        closeStorageAfter();
      }
      setTab('today');
      setSelectedId(null);
      setThoughtModal(false);
      setEditingThoughtId(null);
      setTaskModal(false);
      setEditingTaskId(null);
      setPendingPostponeId(null);
      setAppointmentModal(false);
      setReminderModal(false);
      setPrivacyModal(false);
      if (reminderCleanupFailed) {
        Alert.alert('Local data deleted', 'Your Gather Mind content was erased, but Android may still hold a scheduled or delivered reminder. Clear any visible Gather Mind notification, or remove its alarms in Android settings if one appears.');
      } else {
        flash('All local data and scheduled reminders were deleted');
      }
    } catch (error) {
      Alert.alert('Could not delete local data', `Gather Mind could not complete the deletion. ${String(error)}`);
    } finally {
      deletingAllRef.current = false;
    }
  }

  function confirmDeleteAllData() {
    Alert.alert(
      'Delete all Gather Mind data?',
      'This permanently removes every thought, goal, appointment, appointment-plan item, and scheduled reminder from this phone. This cannot be undone.',
      [
        { text: 'Keep my data', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => void deleteAllData() },
      ],
    );
  }

  async function retryStartup() {
    setStartupError(null);
    try {
      await initialiseApp();
    } catch (error) {
      if (mountedRef.current) setStartupError(String(error));
    }
  }

  if (authenticationCover || lockStatus === 'locked' || lockStatus === 'unlocking') {
    return <LockedScreen topInset={topInset} unlocking={authenticationCover || lockStatus === 'unlocking'} onUnlock={() => void unlockApp(true)} />;
  }
  if (startupError) {
    return <SafeAreaView style={[s.loading, { paddingTop: topInset, paddingHorizontal: 28 }]} edges={['right', 'bottom', 'left']}>
      <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
      <Text style={s.lockSymbol}>!</Text>
      <Text style={s.lockTitle}>Your local data stayed untouched</Text>
      <Text style={s.lockCopy}>Gather Mind could not open its encrypted storage. Nothing was replaced or deleted.{`\n\n`}{startupError}</Text>
      <Pressable style={s.unlockButton} onPress={() => void retryStartup()} accessibilityRole="button"><Text style={s.primaryText}>Try again</Text></Pressable>
    </SafeAreaView>;
  }
  if (!state) return <SafeAreaView style={[s.loading, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}><ActivityIndicator color={C.accentText} /><Text style={s.loadingText}>Gathering your thoughts…</Text></SafeAreaView>;
  const selected = state.appointments.find((item) => item.id === selectedId);
  const editingThought = state.thoughts.find((item) => item.id === editingThoughtId);
  const editingTask = state.tasks.find((item) => item.id === editingTaskId);
  const editingTaskSourceThought = editingTask?.sourceThoughtId ? state.thoughts.find((thought) => thought.id === editingTask.sourceThoughtId) : undefined;
  const editingThoughtHasGoal = !!editingThought && state.tasks.some((task) => task.sourceThoughtId === editingThought.id && (!task.completedOn || task.completedOn === localDateKey()));
  const pendingTask = state.tasks.find((item) => item.id === pendingPostponeId);
  const editorDraft = editorDraftRef.current;

  return <><SafeAreaView style={[s.app, { paddingTop: topInset }]} edges={['right', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.topbar}>
      <Pressable style={s.brand} onPress={() => { setSelectedId(null); setTab('today'); }}>
        <View style={s.brandMark}><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View>
        <Text style={s.brandText}>Gather Mind</Text>
      </Pressable>
      <Pressable style={s.settings} onPress={() => setReminderModal(true)} accessibilityLabel="Settings and privacy"><Text style={s.settingsIcon}>⚙</Text></Pressable>
    </View>

    {selected ? <AppointmentDetail
      appointment={selected}
      thoughts={state.thoughts.filter((thought) => thought.appointmentId === selected.id)}
      draft={editorDraft?.kind === 'agenda' ? editorDraft : undefined}
      onDraftChange={updateEditorDraft}
      onDraftDiscard={discardEditorDraft}
      onBack={() => setSelectedId(null)}
      onChange={(appointment) => commit({ ...state, appointments: state.appointments.map((item) => item.id === appointment.id ? appointment : item) })}
      onAddThought={() => openThought()}
      onEditThought={openThought}
      onEdit={openAppointmentEditor}
      onDelete={() => Alert.alert('Delete this appointment?', 'Its reminder will also be cancelled. Linked thoughts will be kept.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAppointment(selected) },
      ])}
    /> : <>
      {tab === 'today' && <TodayView state={state} notificationsOn={notificationsOn} onEnable={enableReminders} onCapture={() => openThought()} onAddTask={() => openTask()} onEditTask={openTask} onToggleTask={toggleTask} onPostponeTask={requestPostponeTask} onRestoreTask={restoreTask} onAddAppointment={openAppointmentEditor} onOpen={setSelectedId} />}
      {tab === 'thoughts' && <ThoughtsView thoughts={state.thoughts} onCapture={() => openThought()} onEdit={openThought} />}
      {tab === 'appointments' && <AppointmentsView appointments={state.appointments} onAdd={openAppointmentEditor} onOpen={setSelectedId} />}
      <View style={[s.nav, { height: 78 + insets.bottom, paddingBottom: Math.max(4, insets.bottom) }]}>
        <NavButton label="Today" symbol="⌂" active={tab === 'today'} onPress={() => setTab('today')} />
        <NavButton label="Thoughts" symbol="⌘" active={tab === 'thoughts'} onPress={() => setTab('thoughts')} />
        <NavButton label="Appointments" icon="calendar" active={tab === 'appointments'} onPress={() => setTab('appointments')} />
      </View>
    </>}

    <ThoughtModal visible={thoughtModal} thought={editingThought} thoughts={state.thoughts} appointments={state.appointments} hasGoal={editingThoughtHasGoal} draft={editorDraft?.kind === 'thought' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeThoughtEditor} onSave={saveThought} onTurnIntoGoal={turnThoughtIntoGoal} onDelete={deleteThought} preselectedId={selectedId ?? ''} />
    <TaskModal visible={taskModal} task={editingTask} sourceThought={editingTaskSourceThought} draft={editorDraft?.kind === 'task' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeTaskEditor} onSave={saveTask} onDelete={deleteTask} onOpenSourceThought={(thought) => { closeTaskEditor(); openThought(thought); }} />
    <AppointmentModal visible={appointmentModal} appointment={selected} draft={editorDraft?.kind === 'appointment' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeAppointmentEditor} onSave={upsertAppointment} />
    <SettingsModal visible={reminderModal} enabled={notificationsOn} themeMode={themeMode} dailyStatusEnabled={dailyStatusEnabled} dailyStatusMinutes={dailyStatusMinutes} dailyStatusBusy={dailyStatusBusy} appLockEnabled={appLockEnabled} appLockDelayMs={appLockDelayMs} appLockBusy={lockSettingBusy} onClose={() => setReminderModal(false)} onEnable={enableReminders} onThemeModeChange={onThemeModeChange} onDailyStatusChange={(enabled) => void changeDailyStatus(enabled)} onDailyStatusMinutesChange={(minutes) => void changeDailyStatusTime(minutes)} onAppLockChange={(enabled) => void changeAppLock(enabled)} onAppLockDelayChange={(delayMs) => void changeAppLockDelay(delayMs)} onPrivacy={() => { setReminderModal(false); setPrivacyModal(true); }} onDeleteAll={confirmDeleteAllData} />
    <PrivacyModal visible={privacyModal} onClose={() => setPrivacyModal(false)} onDeleteAll={confirmDeleteAllData} />
    <PostponeModal visible={!!pendingTask} task={pendingTask} onClose={() => setPendingPostponeId(null)} onConfirm={() => pendingTask && postponeTask(pendingTask)} />
    {!!notice && <View style={[s.toast, { bottom: 94 + insets.bottom }]}><Text style={s.toastText}>{notice.text}</Text>{notice.onAction && <Pressable style={s.toastAction} onPress={runNoticeAction} accessibilityRole="button"><Text style={s.toastActionText}>{notice.actionLabel}</Text></Pressable>}</View>}
  </SafeAreaView><Modal visible={awayCover} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => undefined}><PrivacyCover topInset={topInset} /></Modal></>;
}

function PrivacyCover({ topInset }: { topInset: number }) {
  const { C, s, isDark } = useAppTheme();
  return <SafeAreaView style={[s.locked, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.lockBrand}><View style={s.brandMark}><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View><Text style={s.brandText}>Gather Mind</Text></View>
    <View style={s.lockContent}><Text style={s.lockSymbol}>●</Text><Text style={s.lockTitle}>Your mind is gathered safely.</Text></View>
  </SafeAreaView>;
}

function LockedScreen({ topInset, unlocking, onUnlock }: { topInset: number; unlocking: boolean; onUnlock: () => void }) {
  const { C, s, isDark } = useAppTheme();
  return <SafeAreaView style={[s.locked, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.lockBrand}><View style={s.brandMark}><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View><Text style={s.brandText}>Gather Mind</Text></View>
    <View style={s.lockContent}>
      <Text style={s.lockSymbol}>●</Text>
      <Text style={s.lockTitle}>Your mind is gathered safely.</Text>
      <Text style={s.lockCopy}>Unlock with your phone’s fingerprint, face recognition, or secure device fallback. Your data remains encrypted on this phone.</Text>
      <Pressable style={[s.unlockButton, unlocking && s.disabled]} onPress={onUnlock} disabled={unlocking} accessibilityRole="button" accessibilityLabel="Unlock Gather Mind">
        {unlocking ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryText}>Unlock Gather Mind</Text>}
      </Pressable>
      <Text style={s.lockHint}>If you removed every enrolled biometric, add one again in your phone settings before unlocking.</Text>
    </View>
  </SafeAreaView>;
}

function TodayView({ state, notificationsOn, onEnable, onCapture, onAddTask, onEditTask, onToggleTask, onPostponeTask, onRestoreTask, onAddAppointment, onOpen }: { state: AppState; notificationsOn: boolean; onEnable: () => void; onCapture: () => void; onAddTask: () => void; onEditTask: (task: DailyTask) => void; onToggleTask: (task: DailyTask) => void; onPostponeTask: (task: DailyTask) => void; onRestoreTask: (task: DailyTask) => void; onAddAppointment: () => void; onOpen: (id: string) => void }) {
  const { C, s } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const next = upcomingAppointments(state.appointments)[0];
  const today = localDateKey();
  const todayTasks = tasksForToday(state.tasks, today);
  const tomorrowTasks = tasksForTomorrow(state.tasks, today);
  const scheduledAhead = tasksScheduledAhead(state.tasks, today);
  const completed = todayTasks.filter((task) => task.completedOn === today).length;
  return <ScrollView style={s.content} contentContainerStyle={[s.body, { paddingBottom: 112 + bottom }]}>
    <Text style={s.eyebrow}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</Text>
    <Text style={s.title}>One thing at a time.</Text>
    <Pressable style={s.capture} onPress={onCapture}><View style={s.plus}><Text style={s.plusText}>+</Text></View><View style={s.flex}><Text style={s.captureTitle}>What’s on your mind?</Text><Text style={s.captureSub}>Catch it now. Sort it later.</Text></View><Text style={s.arrow}>›</Text></Pressable>
    {!notificationsOn && <View style={s.nudge}><View style={s.flex}><Text style={s.cardTitle}>Make reminders dependable</Text><Text style={s.small}>Allow the phone to alert you even when Gather Mind is closed.</Text></View><Pressable style={s.smallPrimary} onPress={onEnable}><Text style={s.smallPrimaryText}>Enable</Text></Pressable></View>}
    <View style={s.taskHeading}><View style={s.flex}><Text style={s.eyebrow}>Today’s gentle list</Text><Text style={s.sectionTitle}>{completed} of {todayTasks.length} complete</Text></View><Pressable style={s.taskAdd} onPress={onAddTask} accessibilityLabel="Add a daily goal"><Text style={s.taskAddText}>+</Text></Pressable></View>
    <View style={s.progressTrack}><View style={[s.progressFill, { width: todayTasks.length ? `${Math.round(completed / todayTasks.length * 100)}%` : '0%' }]} /></View>
    <Text style={s.swipeHint}>Tap to edit · swipe right to complete · left for tomorrow</Text>
    <View style={s.taskList}>{todayTasks.length ? todayTasks.map((task) => <SwipeTaskRow key={task.id} task={task} today={today} onEdit={() => onEditTask(task)} onToggle={() => onToggleTask(task)} onPostpone={() => onPostponeTask(task)} />) : <Empty title="A clear day" body="Add one small goal when you’re ready." />}</View>
    {!!tomorrowTasks.length && <View style={s.tomorrowBox}><Text style={s.tomorrowTitle}>Waiting for tomorrow</Text>{tomorrowTasks.map((task) => <View style={s.tomorrowRow} key={`tomorrow-${task.id}`}><View style={[s.stressDot, { backgroundColor: taskColor(task.offsetCount, C) }]} /><Pressable style={s.tomorrowEdit} onPress={() => onEditTask(task)}><Text style={s.tomorrowText}>{task.title}</Text>{task.offsetCount > 0 ? <Text style={s.movedText}>{taskMoveCountLabel(task)}</Text> : <Text style={s.dailyBadge}>{taskRecurrenceName(task.recurrence)} · starts tomorrow</Text>}</Pressable>{task.offsetCount > 0 && <Pressable style={s.restoreButton} onPress={() => onRestoreTask(task)} accessibilityLabel={`Bring ${task.title} back to today`}><Text style={s.restoreText}>↶ Today</Text></Pressable>}</View>)}</View>}
    {!!scheduledAhead.length && <View style={[s.tomorrowBox, s.scheduledAheadBox]}><Text style={s.tomorrowTitle}>Scheduled ahead</Text>{scheduledAhead.map((task) => <Pressable style={s.scheduledTaskRow} key={`scheduled-${task.id}`} onPress={() => onEditTask(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}, scheduled ${taskDate.format(localDateFromKey(task.scheduledFor))}`}><View style={s.scheduledDate}><Text style={s.scheduledDateText}>{taskDate.format(localDateFromKey(task.scheduledFor))}</Text></View><View style={s.flex}><Text style={s.scheduledTaskText}>{task.title}</Text><Text style={s.scheduledTaskMeta}>{taskRecurrenceName(task.recurrence)}</Text></View><Text style={s.scheduledChevron}>›</Text></Pressable>)}</View>}
    <View style={s.sectionAction}><View style={s.flex}><Text style={s.eyebrow}>Coming up</Text><Text style={s.sectionTitle}>Your next appointment</Text></View><Pressable style={s.scheduleSmall} onPress={onAddAppointment} accessibilityRole="button"><Text style={s.scheduleSmallText}>+ Schedule</Text></Pressable></View>
    {next ? <AppointmentCard appointment={next} linkedCount={state.thoughts.filter((thought) => thought.appointmentId === next.id).length} onPress={() => onOpen(next.id)} /> : <Empty title="Nothing scheduled" body="Add an appointment when you’re ready." />}
  </ScrollView>;
}

function taskColor(offsetCount: number, C: ThemeColors) {
  if (offsetCount >= 5) return C.stress5;
  if (offsetCount === 4) return C.stress4;
  if (offsetCount === 3) return C.stress3;
  if (offsetCount === 2) return C.stress2;
  if (offsetCount === 1) return C.stress1;
  return C.card;
}

function taskRecurrenceName(recurrence: TaskRecurrence) {
  if (recurrence === 'daily') return 'Daily';
  if (recurrence === 'weekly') return 'Weekly';
  if (recurrence === 'monthly') return 'Monthly';
  return 'One-off';
}

function taskMoveCountLabel(task: DailyTask) {
  const limit = taskPostponeLimit(task.recurrence);
  return limit === null ? `Moved ${task.offsetCount}×` : `Moved ${task.offsetCount}/${limit}`;
}

function taskMetaLabel(task: DailyTask) {
  if (task.recurrence === 'once') return task.offsetCount > 0 ? taskMoveCountLabel(task) : '';
  if (task.recurrence === 'daily') return '◇ Daily · stays today';
  const limit = taskPostponeLimit(task.recurrence);
  return `◇ ${taskRecurrenceName(task.recurrence)} · ${task.offsetCount > 0 ? `moved ${task.offsetCount}/${limit}` : `up to ${limit} moves`}`;
}

function SwipeTaskRow({ task, today, onEdit, onToggle, onPostpone }: { task: DailyTask; today: string; onEdit: () => void; onToggle: () => void; onPostpone: () => void }) {
  const { C, s } = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const isDone = task.completedOn === today;
  const carryOverLabel = taskCarryOverLabel(task, today);
  const metaLabel = taskMetaLabel(task);
  const cannotPostpone = !canPostponeTask(task) || isDone;
  function finishSwipe(toValue: number, action: () => void) {
    translateX.stopAnimation();
    Animated.sequence([
      Animated.timing(translateX, { toValue, duration: 100, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) action(); });
  }
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 9 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => {
      const movement = cannotPostpone && gesture.dx < 0 ? gesture.dx * .16 : gesture.dx;
      translateX.setValue(Math.max(-125, Math.min(125, movement)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 72) {
        finishSwipe(125, onToggle);
      } else if (gesture.dx < -72 && !cannotPostpone) {
        finishSwipe(-125, onPostpone);
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 7 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  }), [cannotPostpone, onPostpone, onToggle, translateX]);

  return <View style={s.swipeShell}>
    <View style={s.swipeUnder}><Text style={s.completeReveal}>{isDone ? '↶ Reopen' : '✓ Complete'}</Text><Text style={[s.tomorrowReveal, cannotPostpone && s.lockedReveal]}>{isDone ? 'Completed stays today' : task.recurrence === 'daily' ? 'Daily stays today' : !canPostponeTask(task) ? 'Move limit reached' : 'Tomorrow →'}</Text></View>
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      <View style={[s.taskRow, { backgroundColor: isDone ? C.sagePale : taskColor(task.offsetCount, C) }]}>
        <Pressable style={[s.taskCheck, isDone && s.taskCheckDone]} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}><Text style={s.taskCheckText}>{isDone ? '✓' : ''}</Text></Pressable>
        <Pressable style={s.flex} onPress={onEdit} accessibilityRole="button" accessibilityHint="Opens the goal editor"><Text style={[s.taskText, isDone && s.taskDone]}>{task.title}</Text><View style={s.taskMeta}>{!!carryOverLabel && <Text style={s.carryOverText}>{carryOverLabel}</Text>}{!!metaLabel && <Text style={task.recurrence === 'once' ? s.movedText : s.dailyBadge}>{metaLabel}</Text>}</View></Pressable>
        {canPostponeTask(task) && !isDone && <Pressable style={s.tomorrowButton} onPress={onPostpone} accessibilityLabel={`Move ${task.title} to tomorrow`}><Text style={s.tomorrowButtonText}>→</Text></Pressable>}
        {!canPostponeTask(task) && !isDone && <Text style={s.lockIcon} accessibilityLabel={task.recurrence === 'daily' ? 'Cannot be moved to tomorrow' : 'Move limit reached'}>◆</Text>}
      </View>
    </Animated.View>
  </View>;
}

function ThoughtsView({ thoughts, onCapture, onEdit }: { thoughts: Thought[]; onCapture: () => void; onEdit: (thought: Thought) => void }) {
  const { C, s, bubbles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const matches = useMemo(() => searchThoughts(thoughts, query).slice(0, 12), [thoughts, query]);
  const popularTags = useMemo(() => suggestedTags(thoughts), [thoughts]);
  const focus = thoughts.find((thought) => thought.id === focusId) ?? matches[0];
  const relations = useMemo(() => focus ? relatedThoughts(thoughts, focus.id) : [], [focus?.id, thoughts]);
  function exploreThought(thought: Thought) {
    setFocusId(thought.id);
    setShowConnections(true);
    Keyboard.dismiss();
  }
  return <ScrollView style={s.content} contentContainerStyle={[s.body, { paddingBottom: 112 + bottom }]} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>Find what you caught</Text><Text style={s.title}>Thoughts</Text><Text style={s.subtitle}>Search, revisit, and connect what was on your mind. Everything stays on this phone.</Text>
    <TextInput style={s.search} value={query} onChangeText={(value) => { setQuery(value); setFocusId(null); setShowConnections(false); }} placeholder="Try “meeting”, “sleep”, or “work”" placeholderTextColor={C.muted} accessibilityLabel="Search thoughts" />
    {!!popularTags.length && <><Text style={s.searchHint}>Saved themes</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>{popularTags.map((tag) => <Chip key={tag} label={tag} selected={query.trim().toLocaleLowerCase() === tag} onPress={() => { setQuery(query.trim().toLocaleLowerCase() === tag ? '' : tag); setFocusId(null); setShowConnections(false); }} />)}</ScrollView></>}
    <View style={s.thoughtListHeading}><View style={s.flex}><Text style={s.eyebrow}>{query.trim() ? 'Search results' : 'Recently caught'}</Text><Text style={s.sectionTitle}>{matches.length} {matches.length === 1 ? 'thought' : 'thoughts'}</Text></View><Pressable onPress={onCapture}><Text style={s.link}>+ Add thought</Text></Pressable></View>
    {showConnections && !!focus && <Pressable style={[s.secondary, s.connectionToggle]} onPress={() => setShowConnections(false)} accessibilityRole="button"><Text style={s.secondaryText}>Back to thought list</Text></Pressable>}
    {showConnections && focus && <>
      <View style={s.cloudCard}><View style={s.between}><View style={s.flex}><Text style={s.small}>Connections around</Text><Text style={s.connectionFocus} numberOfLines={2}>{focus.text}</Text></View><Pressable onPress={() => onEdit(focus)}><Text style={s.link}>Edit</Text></Pressable></View><MindMap focus={focus} relations={relations} onExplore={setFocusId} onEdit={() => onEdit(focus)} /></View>
      <Section eyebrow="Why they connect" title="Related to this thought" />
      {relations.length ? relations.map((relation, index) => <ThoughtRow key={`related-${relation.thought.id}`} thought={relation.thought} color={bubbles[index % bubbles.length]} detail={relationSummary(relation)} onPress={() => onEdit(relation.thought)} onExplore={() => exploreThought(relation.thought)} />) : <Empty title="No clear links yet" body="Add a shared theme to this thought, or capture another thought using some of the same meaningful words." />}
    </>}
    {!showConnections && (matches.length ? <View style={s.thoughtList}>{matches.map((thought, index) => <ThoughtRow key={thought.id} thought={thought} color={bubbles[index % bubbles.length]} onPress={() => onEdit(thought)} onExplore={() => exploreThought(thought)} />)}</View> : <Empty title="Nothing gathered here" body={query.trim() ? 'Try another phrase.' : 'Capture a thought whenever you are ready.'} />)}
  </ScrollView>;
}

const MIND_MAP_HEIGHT = 410;
const FOCUS_BUBBLE_SIZE = 116;
const RELATION_BUBBLE_SIZE = 86;

function MindMap({ focus, relations, onExplore, onEdit }: { focus: Thought; relations: ThoughtRelation[]; onExplore: (id: string) => void; onEdit: () => void }) {
  const { s, bubbles } = useAppTheme();
  const [width, setWidth] = useState(0);
  function measure(event: LayoutChangeEvent) {
    const nextWidth = Math.round(event.nativeEvent.layout.width);
    if (nextWidth !== width) setWidth(nextWidth);
  }
  const focusX = width / 2;
  const focusY = MIND_MAP_HEIGHT / 2;
  const positions = [
    { left: 4, top: 8 }, { left: Math.max(4, width - RELATION_BUBBLE_SIZE - 4), top: 8 },
    { left: 0, top: 159 }, { left: Math.max(0, width - RELATION_BUBBLE_SIZE), top: 159 },
    { left: 24, top: 302 }, { left: Math.max(24, width - RELATION_BUBBLE_SIZE - 24), top: 302 },
  ];
  return <View style={s.mindMap} onLayout={measure}>
    {!!width && relations.map((relation, index) => {
      const position = positions[index];
      const targetX = position.left + RELATION_BUBBLE_SIZE / 2;
      const targetY = position.top + RELATION_BUBBLE_SIZE / 2;
      const length = Math.hypot(targetX - focusX, targetY - focusY);
      const angle = Math.atan2(targetY - focusY, targetX - focusX) * 180 / Math.PI;
      return <View key={`line-${relation.thought.id}`} pointerEvents="none" style={[s.connectionLine, { width: length, left: (focusX + targetX - length) / 2, top: (focusY + targetY) / 2, opacity: Math.min(.78, .3 + relation.score * .05), transform: [{ rotate: `${angle}deg` }] }]} />;
    })}
    <Pressable style={[s.focusBubble, { left: Math.max(0, focusX - FOCUS_BUBBLE_SIZE / 2), top: focusY - FOCUS_BUBBLE_SIZE / 2 }]} onPress={onEdit} accessibilityLabel={`Focused thought. Edit thought: ${focus.text}`}>
      <Text style={s.focusLabel}>Focus</Text><Text style={s.focusBubbleText} numberOfLines={4}>{focus.text}</Text>
    </Pressable>
    {!!width && relations.map((relation, index) => <Pressable key={relation.thought.id} style={[s.relationBubble, positions[index], { backgroundColor: bubbles[index % bubbles.length] }]} onPress={() => onExplore(relation.thought.id)} accessibilityLabel={`Explore related thought: ${relation.thought.text}. ${relationSummary(relation)}`} accessibilityHint="Makes this thought the center of the map">
      <Text style={s.relationBubbleText} numberOfLines={3}>{relation.thought.text}</Text><Text style={s.relationBubbleReason} numberOfLines={1}>{shortRelationSummary(relation)}</Text>
    </Pressable>)}
    {!relations.length && <View style={s.noConnections} pointerEvents="none"><Text style={s.noConnectionsText}>No local matches yet</Text></View>}
    {!!relations.length && <Text style={s.mapHint}>Tap an outer thought to explore it · tap the centre to edit</Text>}
  </View>;
}

function relationSummary(relation: ThoughtRelation) {
  const reasons = [];
  if (relation.sharedTags.length) reasons.push(`Themes: ${relation.sharedTags.slice(0, 3).join(', ')}`);
  if (relation.sharedWords.length) reasons.push(`Words: ${relation.sharedWords.slice(0, 3).join(', ')}`);
  if (relation.sharesAppointment) reasons.push('Same appointment');
  return reasons.join(' · ');
}

function shortRelationSummary(relation: ThoughtRelation) {
  if (relation.sharedTags.length) return relation.sharedTags.slice(0, 2).join(' · ');
  if (relation.sharesAppointment) return 'Same appointment';
  return relation.sharedWords.slice(0, 2).join(' · ');
}

function appointmentSuggestionReason(suggestion: AppointmentSuggestion) {
  if (suggestion.sharedWords.length) return `matches ${suggestion.sharedWords.slice(0, 2).join(', ')}`;
  return describeCountdown(suggestion.appointment.startsAt);
}

function AppointmentsView({ appointments, onAdd, onOpen }: { appointments: Appointment[]; onAdd: () => void; onOpen: (id: string) => void }) {
  const { s } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const groups = groupUpcomingAppointments(appointments);
  return <ScrollView style={s.content} contentContainerStyle={[s.body, { paddingBottom: 112 + bottom }]}>
    <Text style={s.eyebrow}>Be ready</Text><Text style={s.title}>Appointments</Text>
    <Text style={s.subtitle}>A dated agenda for the time, place, questions, documents, decisions, and follow-ups you want together.</Text>
    <Pressable style={s.scheduleAction} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Schedule a new appointment"><Text style={s.scheduleActionText}>+ Schedule an appointment</Text></Pressable>
    <View style={s.calendarList}>{groups.length ? groups.map((group) => <View key={group.dateKey} style={s.calendarDay}><View style={s.calendarDayHeader}><View style={s.calendarDayDot} /><Text style={s.calendarDayLabel}>{calendarDayLabel(group.appointments[0].startsAt)}</Text></View><View style={s.calendarDayCards}>{group.appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} linkedCount={0} onPress={() => onOpen(appointment.id)} />)}</View></View>) : <Empty title="Nothing scheduled" body="Use “Schedule an appointment” to choose a date, time, place, and reminder." />}</View>
  </ScrollView>;
}

function calendarDayLabel(startsAt: string) {
  const date = new Date(startsAt);
  const relative = describeCountdown(startsAt);
  const formatted = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date);
  return relative === 'Today' || relative === 'Tomorrow' ? relative + ' · ' + formatted : formatted;
}

function AppointmentDetail({ appointment, thoughts, draft, onDraftChange, onDraftDiscard, onBack, onChange, onAddThought, onEditThought, onEdit, onDelete }: { appointment: Appointment; thoughts: Thought[]; draft?: Extract<EditorDraft, { kind: 'agenda' }>; onDraftChange: (draft: EditorDraft) => void; onDraftDiscard: () => void; onBack: () => void; onChange: (appointment: Appointment) => void; onAddThought: () => void; onEditThought: (thought: Thought) => void; onEdit: () => void; onDelete: () => void }) {
  const { s } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const [planModal, setPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const editingPlanItem = appointment.agenda.find((item) => item.id === editingPlanId);
  useEffect(() => {
    if (draft?.appointmentId === appointment.id) {
      setEditingPlanId(draft.itemId);
      setPlanModal(true);
    }
  }, [appointment.id, draft]);
  function openPlanItem(item?: AgendaItem) { onDraftDiscard(); setEditingPlanId(item?.id ?? null); setPlanModal(true); }
  function closePlanItem() { onDraftDiscard(); setPlanModal(false); setEditingPlanId(null); }
  function savePlanItem(text: string) {
    const agenda = editingPlanItem
      ? appointment.agenda.map((item) => item.id === editingPlanItem.id ? { ...item, text } : item)
      : [...appointment.agenda, { id: makeId('agenda'), text, done: false }];
    onChange({ ...appointment, agenda });
    closePlanItem();
  }
  function deletePlanItem(item: AgendaItem) {
    Alert.alert('Remove this plan item?', 'It will no longer appear with this appointment.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        onChange({ ...appointment, agenda: appointment.agenda.filter((other) => other.id !== item.id) });
        closePlanItem();
      } },
    ]);
  }
  return <><ScrollView style={s.content} contentContainerStyle={[s.detailBody, { paddingBottom: 42 + bottom }]} keyboardShouldPersistTaps="handled">
    <Pressable onPress={onBack}><Text style={s.back}>‹ Appointments</Text></Pressable>
    <View style={s.hero}><Text style={s.heroEyebrow}>{describeCountdown(appointment.startsAt)}</Text><Text style={s.heroTitle}>{appointment.title}</Text><Text style={s.heroFact}>{fullDate.format(new Date(appointment.startsAt))}</Text>{!!appointment.location && <Text style={s.heroFact}>⌖  {appointment.location}</Text>}<View style={s.reminderPill}><Text style={s.reminderPillText}>{appointment.notificationId ? `Reminder set · ${reminderLabel(appointment.reminderMinutes)} before` : 'Reminder off'}</Text></View></View>
    <Section eyebrow="Prepare your way" title="Appointment plan" />
    <Text style={s.planIntro}>Questions, decisions, documents, things to bring, errands, or follow-ups—keep whatever helps you feel prepared.</Text>
    {appointment.agenda.length ? appointment.agenda.map((item) => <View key={item.id} style={s.agenda}><Pressable style={[s.checkbox, item.done && s.checkboxDone]} onPress={() => onChange({ ...appointment, agenda: appointment.agenda.map((other) => other.id === item.id ? { ...other, done: !other.done } : other) })} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }}>{item.done && <Text style={s.check}>✓</Text>}</Pressable><Pressable style={s.agendaContent} onPress={() => openPlanItem(item)} accessibilityHint="Opens this appointment plan item"><Text style={[s.agendaText, item.done && s.done]}>{item.text}</Text><Text style={s.editHint}>Tap to edit</Text></Pressable></View>) : <Empty title="Your plan is open" body="Add anything you want to remember before, during, or after this appointment." />}
    <Pressable style={[s.secondary, s.planAddButton]} onPress={() => openPlanItem()}><Text style={s.secondaryText}>+ Add to appointment plan</Text></Pressable>
    <Section eyebrow="From your thoughts" title="Linked thoughts" />
    {thoughts.length ? thoughts.map((thought) => <Pressable key={thought.id} style={s.linked} onPress={() => onEditThought(thought)}><View style={s.flex}><Text style={s.threadText}>{thought.text}</Text><Text style={s.editHint}>Tap to edit</Text></View><Text style={s.threadChevron}>›</Text></Pressable>) : <Empty title="No linked thoughts" body="Link a thought when you capture it, or add one here." />}
    <Pressable style={[s.secondary, s.linkThoughtButton]} onPress={onAddThought}><Text style={s.secondaryText}>+ Add a linked thought</Text></Pressable>
    <View style={s.detailActions}><Pressable style={s.secondary} onPress={onEdit}><Text style={s.secondaryText}>Edit details</Text></Pressable><Pressable style={s.dangerButton} onPress={onDelete}><Text style={s.dangerText}>Delete</Text></Pressable></View>
  </ScrollView><AgendaItemModal visible={planModal} appointmentId={appointment.id} item={editingPlanItem} draft={draft} onDraftChange={onDraftChange} onClose={closePlanItem} onSave={savePlanItem} onDelete={deletePlanItem} /></>;
}

function AgendaItemModal({ visible, appointmentId, item, draft, onDraftChange, onClose, onSave, onDelete }: { visible: boolean; appointmentId: string; item?: AgendaItem; draft?: Extract<EditorDraft, { kind: 'agenda' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (text: string) => void; onDelete: (item: AgendaItem) => void }) {
  const { C, s } = useAppTheme();
  const [text, setText] = useState('');
  const itemId = item?.id ?? draft?.itemId ?? null;
  useEffect(() => { if (visible) setText(draft?.text ?? item?.text ?? ''); }, [visible, item, draft]);
  function changeText(next: string) {
    setText(next);
    onDraftChange({ kind: 'agenda', appointmentId, itemId, text: next });
  }
  return <Sheet visible={visible} onClose={onClose} eyebrow={item ? 'Edit plan item' : 'Appointment plan'} title={item ? 'Update this item' : 'What do you want to remember?'} expanded>
    <Text style={s.modalCopy}>This can be a question, decision, document, thing to bring, errand, or follow-up.</Text>
    <Field>Plan item</Field><SheetTextInput style={[s.input, s.textarea]} value={text} onChangeText={changeText} placeholder="Write it in your own words" placeholderTextColor={C.muted} multiline autoFocus />
    <Primary label={item ? 'Save changes' : 'Add to appointment plan'} onPress={() => onSave(text.trim())} disabled={!text.trim()} />
    {item && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(item)}><Text style={s.dangerText}>Remove plan item</Text></Pressable>}
  </Sheet>;
}

function TaskModal({ visible, task, sourceThought, draft, onDraftChange, onClose, onSave, onDelete, onOpenSourceThought }: { visible: boolean; task?: DailyTask; sourceThought?: Thought; draft?: Extract<EditorDraft, { kind: 'task' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (title: string, recurrence: TaskRecurrence, scheduledFor: string, existing?: DailyTask) => void; onDelete: (task: DailyTask) => void; onOpenSourceThought: (thought: Thought) => void }) {
  const { C, s } = useAppTheme();
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('once');
  const [scheduledFor, setScheduledFor] = useState(localDateKey());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const itemId = task?.id ?? draft?.itemId ?? null;
  const today = localDateKey();
  const scheduledRecurrence = recurrence !== 'once';
  const calendarRecurrence = recurrence === 'weekly' || recurrence === 'monthly';
  useEffect(() => {
    if (visible) {
      setTitle(draft?.title ?? task?.title ?? '');
      setRecurrence(draft?.recurrence ?? task?.recurrence ?? 'once');
      setScheduledFor(draft?.scheduledFor ?? task?.scheduledFor ?? today);
      setShowDatePicker(false);
    }
  }, [visible, task, draft, today]);
  function changeTitle(next: string) { setTitle(next); onDraftChange({ kind: 'task', itemId, title: next, recurrence, scheduledFor }); }
  function changeRecurrence(next: TaskRecurrence) {
    const nextScheduledRecurrence = next !== 'once';
    const nextDate = nextScheduledRecurrence && scheduledFor < today ? today : scheduledFor;
    setRecurrence(next);
    setScheduledFor(nextDate);
    setShowDatePicker(false);
    onDraftChange({ kind: 'task', itemId, title, recurrence: next, scheduledFor: nextDate });
  }
  function changeScheduleDate(_event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!value) return;
    const next = localDateKey(value);
    setScheduledFor(next);
    onDraftChange({ kind: 'task', itemId, title, recurrence, scheduledFor: next });
  }
  const scheduleLabel = task && task.recurrence === recurrence ? recurrence === 'daily' ? 'Start date' : 'Next occurrence' : 'First occurrence';
  const schedulesAhead = scheduledRecurrence && scheduledFor > today;
  return <Sheet visible={visible} onClose={onClose} eyebrow={task ? 'Edit goal' : 'One manageable thing'} title={task ? 'Adjust this goal' : 'Add to today'} expanded>
    <Field>What would you like to do?</Field>
    <SheetTextInput style={s.input} value={title} onChangeText={changeTitle} placeholder="A small, clear goal" placeholderTextColor={C.muted} autoFocus onSubmitEditing={() => title.trim() && onSave(title.trim(), recurrence, scheduledFor, task)} />
    {sourceThought && <Pressable style={s.sourceThoughtCard} onPress={() => onOpenSourceThought(sourceThought)} accessibilityRole="button" accessibilityLabel="Open the thought this goal came from"><View style={s.flex}><Text style={s.sourceThoughtLabel}>From thought</Text><Text style={s.sourceThoughtText} numberOfLines={2}>{sourceThought.text}</Text></View><Text style={s.link}>Open</Text></Pressable>}
    <Field>How often?</Field>
    <View style={s.taskTypeChoices}>
      {TASK_RECURRENCE_OPTIONS.map((option) => <Pressable key={option.value} style={[s.taskType, recurrence === option.value && s.taskTypeSelected]} onPress={() => changeRecurrence(option.value)} accessibilityRole="radio" accessibilityState={{ checked: recurrence === option.value }}><Text style={s.taskTypeTitle}>{option.title}</Text><Text style={s.small}>{option.description}</Text></Pressable>)}
    </View>
    {scheduledRecurrence && <>
      <Field>{scheduleLabel}</Field>
      <Text style={s.inputHint}>{task && task.recurrence === recurrence
        ? recurrence === 'daily' ? 'Changing this date changes when the daily essential becomes active.' : `Changing this date starts a new ${recurrence} rhythm.`
        : recurrence === 'daily' ? 'The essential first appears on this date, then returns every day.' : `The goal first appears on this date, then repeats on the same ${recurrence === 'weekly' ? 'weekday' : 'calendar date'}.`}</Text>
      <Pressable style={[s.dateButton, s.taskDateButton]} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} accessibilityRole="button" accessibilityLabel={`Choose ${scheduleLabel.toLowerCase()}`}><Text style={s.dateLabel}>{scheduleLabel.toUpperCase()}</Text><Text style={s.dateValue}>{taskDate.format(localDateFromKey(scheduledFor))}</Text></Pressable>
      {showDatePicker && <View style={s.pickerWrap}><DateTimePicker value={localDateFromKey(scheduledFor)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={localDateFromKey(today)} onChange={changeScheduleDate} />{Platform.OS === 'ios' && <Pressable onPress={() => setShowDatePicker(false)}><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
      {recurrence === 'daily' && <View style={s.dailyNote}><Text style={s.dailyNoteIcon}>◆</Text><Text style={[s.small, s.flex]}>Once active, it stays visible each day and cannot be moved to tomorrow.</Text></View>}
      {calendarRecurrence && <View style={s.dailyNote}><Text style={s.dailyNoteIcon}>◇</Text><Text style={[s.small, s.flex]}>Its move allowance resets after each completion.</Text></View>}
    </>}
    <Primary label={task ? 'Save changes' : schedulesAhead ? 'Schedule goal' : 'Add to today'} onPress={() => onSave(title.trim(), recurrence, scheduledFor, task)} disabled={!title.trim()} />
    {task && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(task)}><Text style={s.dangerText}>Remove goal</Text></Pressable>}
  </Sheet>;
}

function ThoughtModal({ visible, thought, thoughts, appointments, hasGoal, draft, onDraftChange, onClose, onSave, onTurnIntoGoal, onDelete, preselectedId }: { visible: boolean; thought?: Thought; thoughts: Thought[]; appointments: Appointment[]; hasGoal: boolean; draft?: Extract<EditorDraft, { kind: 'thought' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, existing?: Thought) => void; onTurnIntoGoal: (input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, thought: Thought) => void; onDelete: (thought: Thought) => void; preselectedId: string }) {
  const { C, s } = useAppTheme();
  const [text, setText] = useState(''); const [tags, setTags] = useState(''); const [appointmentId, setAppointmentId] = useState(preselectedId);
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const themeSuggestionsRef = useRef<View | null>(null);
  const itemId = thought?.id ?? draft?.itemId ?? null;
  useEffect(() => { if (visible) { setText(draft?.text ?? thought?.text ?? ''); setTags(draft?.tags ?? thought?.tags.join(', ') ?? ''); setAppointmentId(draft?.appointmentId ?? thought?.appointmentId ?? preselectedId); setShowAllAppointments(false); } }, [visible, thought, preselectedId, draft]);
  const tagParts = tags.split(',');
  const currentTag = tagParts[tagParts.length - 1]?.trim() ?? '';
  const completedTags = tagParts.slice(0, -1).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  const appointmentSuggestions = useMemo(() => suggestedAppointments(appointments, thoughts, text), [appointments, thoughts, text]);
  const linkedAppointment = appointments.find((appointment) => appointment.id === appointmentId);
  const suggestedChoices: AppointmentSuggestion[] = linkedAppointment && !appointmentSuggestions.some(({ appointment }) => appointment.id === linkedAppointment.id)
    ? [{ appointment: linkedAppointment, sharedWords: [] }, ...appointmentSuggestions]
    : appointmentSuggestions;
  const allAppointmentChoices: AppointmentSuggestion[] = useMemo(() => [...appointments]
    .sort((a, b) => Math.abs(Date.parse(a.startsAt) - Date.now()) - Math.abs(Date.parse(b.startsAt) - Date.now()))
    .map((appointment) => ({ appointment, sharedWords: [] })), [appointments]);
  const appointmentChoices = showAllAppointments ? allAppointmentChoices : suggestedChoices;
  const contextualAppointmentIds = [...new Set([appointmentId, ...appointmentSuggestions.map(({ appointment }) => appointment.id)].filter(Boolean))];
  const tagMatches = suggestedTags(thoughts, completedTags, currentTag, 8, contextualAppointmentIds);
  function publishDraft(next: Partial<Pick<Extract<EditorDraft, { kind: 'thought' }>, 'text' | 'tags' | 'appointmentId'>>) {
    onDraftChange({ kind: 'thought', itemId, text, tags, appointmentId, ...next });
  }
  function changeText(next: string) { setText(next); publishDraft({ text: next }); }
  function changeTags(next: string) { setTags(next); publishDraft({ tags: next }); }
  function changeAppointment(next: string) { setAppointmentId(next); publishDraft({ appointmentId: next }); }
  function addSuggestedTag(tag: string) { changeTags(`${[...new Set([...completedTags, tag])].join(', ')}, `); }
  function currentInput(): Pick<Thought, 'text' | 'tags' | 'appointmentId'> {
    return { text: text.trim(), tags: [...new Set(tags.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))], appointmentId };
  }
  function submit() { if (!text.trim()) return; onSave(currentInput(), thought); }
  return <Sheet visible={visible} onClose={onClose} eyebrow={thought ? 'Edit thought' : 'Quick capture'} title={thought ? 'Adjust what you caught' : 'What’s on your mind?'} expanded>
    <Field>Thought</Field><SheetTextInput style={[s.input, s.textarea]} value={text} onChangeText={changeText} placeholder="It can be messy. Just get it out." placeholderTextColor={C.muted} multiline autoFocus />
    <View>
      <Field>Themes (optional)</Field><SheetTextInput style={s.input} value={tags} onChangeText={changeTags} keyboardExtraOffset={12} revealThroughRef={themeSuggestionsRef} placeholder="health, sleep, work" placeholderTextColor={C.muted} />
      <SheetFocusAccessory innerRef={themeSuggestionsRef}>
        <Text style={s.inputHint}>Separate themes with commas. Saved themes appear as you type.</Text>
        {!!tagMatches.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.suggestionChips}>{tagMatches.map((tag) => <Chip key={tag} label={tag} selected={false} onPress={() => addSuggestedTag(tag)} />)}</ScrollView>}
      </SheetFocusAccessory>
    </View>
    {!!appointments.length && <><Field>{showAllAppointments ? 'Link to an appointment (optional)' : 'Possible appointment (optional)'}</Field><Text style={s.inputHint}>Suggested from nearby dates and matching words on this phone. Nothing is linked until you choose it.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.suggestionChips}><Chip label="Not linked" selected={!appointmentId} onPress={() => changeAppointment('')} />{appointmentChoices.map((suggestion) => <Chip key={suggestion.appointment.id} label={`${suggestion.appointment.title} · ${appointmentSuggestionReason(suggestion)}`} selected={appointmentId === suggestion.appointment.id} onPress={() => changeAppointment(suggestion.appointment.id)} />)}</ScrollView>{appointments.length > suggestedChoices.length && <Pressable style={s.showAllLink} onPress={() => setShowAllAppointments((shown) => !shown)}><Text style={s.link}>{showAllAppointments ? 'Show nearby suggestions' : 'See all appointments'}</Text></Pressable>}</>}
    <Primary label={thought ? 'Save changes' : 'Keep this thought'} onPress={submit} disabled={!text.trim()} />
    {thought && <><Pressable style={[s.secondary, s.thoughtToGoal, hasGoal && s.disabled]} onPress={() => onTurnIntoGoal(currentInput(), thought)} disabled={hasGoal || !text.trim()} accessibilityRole="button"><Text style={s.secondaryText}>{hasGoal ? 'Already added as a goal' : 'Turn into today’s goal'}</Text></Pressable><Text style={s.thoughtToGoalHint}>The original thought stays here, and the goal links back to it.</Text></>}
    {thought && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(thought)}><Text style={s.dangerText}>Remove thought</Text></Pressable>}
  </Sheet>;
}

function PostponeModal({ visible, task, onClose, onConfirm }: { visible: boolean; task?: DailyTask; onClose: () => void; onConfirm: () => void }) {
  const { C, s } = useAppTheme();
  const limit = task ? taskPostponeLimit(task.recurrence) : null;
  const nextMove = (task?.offsetCount ?? 0) + 1;
  return <Sheet visible={visible} onClose={onClose} eyebrow="A deliberate move" title="Move to tomorrow?">
    <View style={s.confirmPreview}><View style={[s.confirmDot, { backgroundColor: taskColor(nextMove, C) }]} /><View style={s.flex}><Text style={s.cardTitle}>{task?.title}</Text><Text style={s.small}>It will remain visible under “Waiting for tomorrow,” and you can bring it back.</Text></View></View>
    <Text style={s.modalCopy}>{limit === null
      ? `This will be move ${nextMove}. Repeated moves gradually use a warmer color, without hiding or judging the goal.`
      : `This will be move ${nextMove} of ${limit} for this ${taskRecurrenceName(task?.recurrence ?? 'once').toLowerCase()} occurrence. At the limit, the goal stays visible until completed.`}</Text>
    <View style={s.confirmActions}><Pressable style={s.secondary} onPress={onClose}><Text style={s.secondaryText}>Keep on today</Text></Pressable><Pressable style={s.confirmPrimary} onPress={onConfirm}><Text style={s.primaryText}>Yes, tomorrow</Text></Pressable></View>
  </Sheet>;
}

function AppointmentModal({ visible, appointment, draft, onDraftChange, onClose, onSave }: { visible: boolean; appointment?: Appointment; draft?: Extract<EditorDraft, { kind: 'appointment' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (input: Omit<Appointment, 'notificationId' | 'createdAt' | 'agenda'> & { existing?: Appointment }) => void }) {
  const { C, s } = useAppTheme();
  const defaultDate = useMemo(() => { const value = new Date(); value.setDate(value.getDate() + 1); value.setHours(10, 0, 0, 0); return value; }, []);
  const [title, setTitle] = useState(''); const [location, setLocation] = useState(''); const [date, setDate] = useState(defaultDate); const [minutes, setMinutes] = useState(120); const [picker, setPicker] = useState<PickerMode>(null);
  const itemId = appointment?.id ?? draft?.itemId ?? null;
  useEffect(() => { if (visible) { setTitle(draft?.title ?? appointment?.title ?? ''); setLocation(draft?.location ?? appointment?.location ?? ''); setDate(new Date(draft?.startsAt ?? appointment?.startsAt ?? defaultDate)); setMinutes(draft?.reminderMinutes ?? appointment?.reminderMinutes ?? 120); setPicker(null); } }, [visible, appointment, defaultDate, draft]);
  function publishDraft(next: Partial<Pick<Extract<EditorDraft, { kind: 'appointment' }>, 'title' | 'startsAt' | 'location' | 'reminderMinutes'>>) {
    onDraftChange({ kind: 'appointment', itemId, title, startsAt: date.toISOString(), location, reminderMinutes: minutes, ...next });
  }
  function changeTitle(next: string) { setTitle(next); publishDraft({ title: next }); }
  function changeLocation(next: string) { setLocation(next); publishDraft({ location: next }); }
  function changeMinutes(next: number) { setMinutes(next); publishDraft({ reminderMinutes: next }); }
  function changeDate(_event: DateTimePickerEvent, value?: Date) { if (Platform.OS === 'android') setPicker(null); if (value) { setDate(value); publishDraft({ startsAt: value.toISOString() }); } }
  function openPicker(mode: Exclude<PickerMode, null>) { Keyboard.dismiss(); setPicker(mode); }
  function submit() { if (title.trim()) onSave({ id: appointment?.id ?? makeId('appointment'), title: title.trim(), startsAt: date.toISOString(), location: location.trim(), reminderMinutes: minutes, existing: appointment }); }
  return <Sheet visible={visible} onClose={onClose} eyebrow={appointment ? 'Edit appointment' : 'New appointment'} title="When do you need to be there?" expanded>
    <Field>Appointment name</Field><SheetTextInput style={s.input} value={title} onChangeText={changeTitle} placeholder="Doctor, teacher, contractor, meeting…" placeholderTextColor={C.muted} autoFocus />
    <Field>Date and time</Field><View style={s.dateRow}><Pressable style={s.dateButton} onPress={() => openPicker('date')} accessibilityRole="button" accessibilityLabel="Choose appointment date"><Text style={s.dateLabel}>DATE</Text><Text style={s.dateValue}>{shortDate.format(date)}</Text></Pressable><Pressable style={s.dateButton} onPress={() => openPicker('time')} accessibilityRole="button" accessibilityLabel="Choose appointment time"><Text style={s.dateLabel}>TIME</Text><Text style={s.dateValue}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}</Text></Pressable></View>
    {!!picker && <View style={s.pickerWrap}><DateTimePicker value={date} mode={picker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={picker === 'date' ? new Date() : undefined} onChange={changeDate} />{Platform.OS === 'ios' && <Pressable onPress={() => setPicker(null)}><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    <Field>Place or person (optional)</Field><SheetTextInput style={s.input} value={location} onChangeText={changeLocation} placeholder="Office, address, person, or video call" placeholderTextColor={C.muted} />
    <Field>Remind me</Field><View style={s.reminderChoices}>{REMINDER_OPTIONS.map((option) => <Chip key={option.value} label={option.label} selected={minutes === option.value} onPress={() => changeMinutes(option.value)} />)}</View>
    <Primary label={appointment ? 'Save changes' : 'Create appointment'} onPress={submit} disabled={!title.trim()} />
  </Sheet>;
}

function SettingsModal({ visible, enabled, themeMode, dailyStatusEnabled, dailyStatusMinutes, dailyStatusBusy, appLockEnabled, appLockDelayMs, appLockBusy, onClose, onEnable, onThemeModeChange, onDailyStatusChange, onDailyStatusMinutesChange, onAppLockChange, onAppLockDelayChange, onPrivacy, onDeleteAll }: { visible: boolean; enabled: boolean; themeMode: ThemeMode; dailyStatusEnabled: boolean; dailyStatusMinutes: number; dailyStatusBusy: boolean; appLockEnabled: boolean; appLockDelayMs: AppLockDelayMs; appLockBusy: boolean; onClose: () => void; onEnable: () => void; onThemeModeChange: (mode: ThemeMode) => void; onDailyStatusChange: (enabled: boolean) => void; onDailyStatusMinutesChange: (minutes: number) => void; onAppLockChange: (enabled: boolean) => void; onAppLockDelayChange: (delayMs: AppLockDelayMs) => void; onPrivacy: () => void; onDeleteAll: () => void }) {
  const { C, s } = useAppTheme();
  const [showDailyStatusTimePicker, setShowDailyStatusTimePicker] = useState(false);
  useEffect(() => { if (!visible || !dailyStatusEnabled) setShowDailyStatusTimePicker(false); }, [visible, dailyStatusEnabled]);
  function changeDailyStatusPicker(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setShowDailyStatusTimePicker(false);
    if (event.type === 'dismissed' || !value) return;
    onDailyStatusMinutesChange(value.getHours() * 60 + value.getMinutes());
  }
  return <Sheet visible={visible} onClose={onClose} eyebrow="Gather Mind 0.5.8" title="Settings & privacy">
    <Field>Appearance</Field>
    <View style={s.themeChoices}>{THEME_MODE_OPTIONS.map((option) => <Pressable key={option.value} style={[s.themeChoice, themeMode === option.value && s.themeChoiceSelected]} onPress={() => onThemeModeChange(option.value)} accessibilityRole="radio" accessibilityState={{ checked: themeMode === option.value }}><Text style={[s.themeChoiceText, themeMode === option.value && s.themeChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
    <Text style={s.privacy}>Follow device changes automatically with your phone’s light or dark appearance.</Text>
    <Field>Appointment reminders</Field>
    <View style={s.reminderStatus}><View style={[s.statusDot, enabled && s.statusDotOn]} /><View style={s.flex}><Text style={s.cardTitle}>{enabled ? 'Reminders are enabled' : 'Reminders are off'}</Text><Text style={s.small}>Scheduled locally by your phone. No account, internet connection, or backend is needed.</Text></View></View>
    {!enabled && <Primary label="Enable reminders" onPress={onEnable} />}
    <Text style={s.privacy}>Your phone may delay notifications in Focus, Do Not Disturb, or extreme battery-saving modes.</Text>
    <Field>Daily goals</Field>
    <View style={s.securitySetting}><View style={s.flex}><Text style={s.cardTitle}>Quiet daily status</Text><Text style={s.small}>After your chosen time, show one silent notification-list count only when today still has unfinished goals. Goal titles stay private.</Text></View><Switch value={dailyStatusEnabled} onValueChange={onDailyStatusChange} disabled={dailyStatusBusy} trackColor={{ false: C.line, true: C.sage }} thumbColor={dailyStatusEnabled ? C.accentSolid : C.white} accessibilityLabel="Show a quiet daily status for unfinished goals" /></View>
    {dailyStatusEnabled && <View style={s.dailyStatusTimeSetting}><View style={s.flex}><Text style={s.cardTitle}>Show after</Text><Text style={s.small}>The status is refreshed locally when your goals change.</Text></View><Pressable style={[s.dailyStatusTimeButton, dailyStatusBusy && s.disabled]} onPress={() => setShowDailyStatusTimePicker(true)} disabled={dailyStatusBusy} accessibilityRole="button" accessibilityLabel={`Change quiet daily status time, currently ${formatDailyStatusTime(dailyStatusMinutes)}`}><Text style={s.dailyStatusTimeText}>{formatDailyStatusTime(dailyStatusMinutes)}</Text></Pressable></View>}
    {dailyStatusEnabled && showDailyStatusTimePicker && <View style={s.pickerWrap}><DateTimePicker value={dateAtLocalMinutes(localDateKey(), dailyStatusMinutes)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={changeDailyStatusPicker} />{Platform.OS === 'ios' && <Pressable onPress={() => setShowDailyStatusTimePicker(false)}><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    {dailyStatusEnabled && !enabled && <Text style={s.inputHint}>Android notification permission is currently off, so the quiet status cannot appear.</Text>}
    <Field>Security</Field>
    <View style={s.securitySetting}><View style={s.flex}><Text style={s.cardTitle}>Lock Gather Mind</Text><Text style={s.small}>Ask for strong fingerprint or secure face recognition after you have left the app. Your database is encrypted whether this is on or off.</Text></View><Switch value={appLockEnabled} onValueChange={onAppLockChange} disabled={appLockBusy} trackColor={{ false: C.line, true: C.sage }} thumbColor={appLockEnabled ? C.accentSolid : C.white} accessibilityLabel="Lock Gather Mind with biometrics" /></View>
    {appLockEnabled && <View style={s.lockDelaySetting}>
      <Text style={s.cardTitle}>Require unlock</Text>
      <Text style={s.small}>The app is covered immediately in the app switcher. Return within this time without another biometric check.</Text>
      <View style={s.lockDelayChoices}>{APP_LOCK_DELAY_OPTIONS.map((option) => <Pressable key={option.value} style={[s.lockDelayChoice, appLockDelayMs === option.value && s.lockDelayChoiceSelected, appLockBusy && s.disabled]} onPress={() => onAppLockDelayChange(option.value)} disabled={appLockBusy} accessibilityRole="radio" accessibilityState={{ checked: appLockDelayMs === option.value }}><Text style={[s.lockDelayChoiceText, appLockDelayMs === option.value && s.lockDelayChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
    </View>}
    <Text style={s.privacy}>The encryption key stays in this device’s secure key store and is not tied to your biometric profile. Removing all enrolled biometrics can temporarily block the app until you add one again.</Text>
    <Field>Privacy & support</Field>
    <View style={s.privacySummary}><Text style={s.cardTitle}>Private and encrypted by default</Text><Text style={s.small}>Your content stays encrypted on this phone. Gather Mind has no account, ads, analytics, backend, or remote sync.</Text></View>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={onPrivacy}><Text style={s.secondaryText}>Read privacy & support</Text></Pressable>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll}><Text style={s.dangerText}>Delete all local data</Text></Pressable>
  </Sheet>;
}

function PrivacyModal({ visible, onClose, onDeleteAll }: { visible: boolean; onClose: () => void; onDeleteAll: () => void }) {
  const { s } = useAppTheme();
  return <Sheet visible={visible} onClose={onClose} eyebrow="Effective 21 August 2026" title="Privacy, data & support">
    <View style={s.privacySummary}><Text style={s.cardTitle}>Your data stays encrypted on your device</Text><Text style={s.small}>Gather Mind 0.5.8 does not collect, transmit, sell, or share your thoughts, goals, appointments, or usage data.</Text></View>
    <Field>What the app stores</Field>
    <Text style={s.policyText}>The content you enter is stored in an encrypted database in the app’s private local storage. Its random key is kept in the phone’s secure key store. Appointment reminders and the optional generic daily goal count are scheduled by your phone’s operating system. The count never includes goal titles. No account, advertising, analytics, cloud sync, or backend service is used.</Text>
    <Field>Permissions</Field>
    <Text style={s.policyText}>Notification access is used only for appointment reminders and the optional quiet daily goal status you choose. Exact-alarm access helps Android deliver the selected local times accurately; timing can be less exact without it. If you turn on Lock Gather Mind, the biometric prompt is used only to unlock the app locally. You can deny notifications and leave both optional features off.</Text>
    <Field>Retention and deletion</Field>
    <Text style={s.policyText}>Data remains until you delete individual items, use the control below, clear the app’s storage, or uninstall the app. Delete all also cancels Gather Mind’s scheduled reminders. Android cloud backup is disabled for this app.</Text>
    <Field>Support</Field>
    <Text style={s.policyText}>For a reminder problem, check Android notifications, Special app access → Alarms & reminders, Focus, Do Not Disturb, and battery settings. Open and save the appointment again after changing permissions.</Text>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={() => void Linking.openURL('https://github.com/fezdk/gather_mind/issues?subject=Gather%20Mind%20support')}><Text style={s.secondaryText}>Email https://github.com/fezdk/gather_mind/issues</Text></Pressable>
    <Text style={s.disclaimer}>Gather Mind is an organisational aid, not a medical device, diagnostic tool, treatment, or substitute for professional care. The source code is Apache-2.0 licensed; that software licence does not grant anyone rights to your personal content.</Text>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll}><Text style={s.dangerText}>Delete all local data</Text></Pressable>
  </Sheet>;
}

type SheetInputFocusController = {
  focus: (input: TextInput, extraOffset: number, revealThrough: View | null) => void;
  refresh: () => void;
};
const SheetInputFocusContext = createContext<SheetInputFocusController | null>(null);

function SheetTextInput({ keyboardExtraOffset = 18, revealThroughRef, onFocus, ...props }: TextInputProps & { keyboardExtraOffset?: number; revealThroughRef?: RefObject<View | null> }) {
  const inputRef = useRef<TextInput | null>(null);
  const focusController = useContext(SheetInputFocusContext);
  return <TextInput {...props} ref={inputRef} onFocus={(event) => {
    onFocus?.(event);
    if (inputRef.current) focusController?.focus(inputRef.current, keyboardExtraOffset, revealThroughRef?.current ?? null);
  }} />;
}

function SheetFocusAccessory({ innerRef, children }: { innerRef: RefObject<View | null>; children: ReactNode }) {
  const focusController = useContext(SheetInputFocusContext);
  return <View ref={innerRef} collapsable={false} onLayout={() => focusController?.refresh()}>{children}</View>;
}

function Sheet({ visible, onClose, eyebrow, title, children, expanded = false }: { visible: boolean; onClose: () => void; eyebrow: string; title: string; children: ReactNode; expanded?: boolean }) {
  const { s } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const stableBottomInsetRef = useRef(bottom);
  if (!visible) stableBottomInsetRef.current = bottom;
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);
  const scrollOffsetRef = useRef(0);
  const focusedInputRef = useRef<{ input: TextInput; extraOffset: number; revealThrough: View | null } | null>(null);
  const revealTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  function clearRevealTimers() {
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];
  }

  function revealFocusedInput(input: TextInput, extraOffset: number, revealThrough: View | null) {
    focusedInputRef.current = { input, extraOffset, revealThrough };
    clearRevealTimers();
    const reveal = () => {
      const scrollView = scrollRef.current;
      const viewport = viewportRef.current;
      if (!scrollView || !viewport || !focusedInputRef.current || focusedInputRef.current.input !== input) return;
      viewport.measureInWindow((_scrollX, viewportTop, _scrollWidth, viewportHeight) => {
        if (viewportHeight <= 0 || !focusedInputRef.current || focusedInputRef.current.input !== input) return;
        input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
          if (!focusedInputRef.current || focusedInputRef.current.input !== input) return;
          const revealWithBottom = (contentBottom: number) => {
            if (!focusedInputRef.current || focusedInputRef.current.input !== input) return;
            const viewportBottom = viewportTop + viewportHeight;
            const keyboardTop = Keyboard.metrics()?.screenY;
            const nextOffset = scrollOffsetForVisibleInput({
              currentOffset: scrollOffsetRef.current,
              inputTop,
              inputBottom: contentBottom,
              viewportTop,
              viewportBottom: visibleViewportBottom(viewportBottom, keyboardTop),
              extraOffset,
            });
            if (nextOffset === scrollOffsetRef.current) return;
            scrollOffsetRef.current = nextOffset;
            // Android reports keyboardDidShow after adjustResize has settled. Move
            // immediately there so delayed measurements cannot compound an in-flight
            // animation; iOS can follow its keyboard animation.
            scrollView.scrollTo({ y: nextOffset, animated: Platform.OS === 'ios' });
          };
          if (revealThrough) {
            revealThrough.measureInWindow((_targetX, targetTop, _targetWidth, targetHeight) => revealWithBottom(targetTop + targetHeight));
          } else {
            revealWithBottom(inputTop + inputHeight);
          }
        });
      });
    };
    reveal();
    revealTimersRef.current.push(setTimeout(reveal, 90), setTimeout(reveal, 260));
  }

  function refreshFocusedInput() {
    const focused = focusedInputRef.current;
    if (focused) revealFocusedInput(focused.input, focused.extraOffset, focused.revealThrough);
  }

  useEffect(() => {
    if (!visible) { focusedInputRef.current = null; clearRevealTimers(); return; }
    scrollOffsetRef.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const shown = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => {
      refreshFocusedInput();
    });
    const hidden = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      clearRevealTimers();
    });
    return () => { shown.remove(); hidden.remove(); clearRevealTimers(); };
  }, [visible]);
  const content = <View style={[s.sheet, expanded && s.sheetExpanded, { paddingBottom: 18 + stableBottomInsetRef.current }]}><View style={s.handle} /><View style={s.between}><View style={s.flex}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sheetTitle}>{title}</Text></View><Pressable style={s.close} onPress={onClose} accessibilityLabel="Close"><Text style={s.closeText}>×</Text></Pressable></View><View ref={viewportRef} style={[s.sheetScroll, expanded && s.sheetScrollExpanded]}><ScrollView ref={scrollRef} style={expanded && s.flex} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>{children}</ScrollView></View></View>;
  return <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><SheetInputFocusContext.Provider value={{ focus: revealFocusedInput, refresh: refreshFocusedInput }}>{Platform.OS === 'ios' ? <KeyboardAvoidingView style={s.backdrop} behavior="padding">{content}</KeyboardAvoidingView> : <View style={s.backdrop}>{content}</View>}</SheetInputFocusContext.Provider></Modal>;
}

function AppointmentCard({ appointment, linkedCount, onPress }: { appointment: Appointment; linkedCount: number; onPress: () => void }) {
  const { s } = useAppTheme();
  const date = new Date(appointment.startsAt); const total = appointment.agenda.length + linkedCount;
  return <Pressable style={s.appointmentCard} onPress={onPress}><View style={s.dateBlock}><Text style={s.dateMonth}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</Text><Text style={s.dateDay}>{date.getDate()}</Text></View><View style={s.flex}><Text style={s.cardTitle} numberOfLines={1}>{appointment.title}</Text><Text style={s.small}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(date)}</Text><Text style={s.reminderLine}>{appointment.notificationId ? '◷ Reminder set' : '◷ Reminder off'} · {total} items</Text></View><Text style={s.chevron}>›</Text></Pressable>;
}

function ThoughtRow({ thought, color, onPress, onExplore, detail }: { thought: Thought; color: string; onPress: () => void; onExplore?: () => void; detail?: string }) {
  const { s } = useAppTheme();
  return <View style={s.thread}>
    <Pressable style={s.threadMain} onPress={onPress} accessibilityHint="Opens this thought for editing">
      <View style={[s.threadDot, { backgroundColor: color }]} /><View style={s.flex}><Text style={s.threadText} numberOfLines={2}>{thought.text}</Text><Text style={s.tags}>{detail ?? (thought.tags.join(' · ') || 'Unsorted')}</Text></View>
      {!onExplore && <Text style={s.threadChevron}>›</Text>}
    </Pressable>
    {onExplore && <Pressable style={s.threadExplore} onPress={onExplore} accessibilityRole="button" accessibilityLabel={`Explore connections for: ${thought.text}`}><Text style={s.threadExploreText}>Connections</Text></Pressable>}
  </View>;
}
function Section({ eyebrow, title }: { eyebrow: string; title: string }) { const { s } = useAppTheme(); return <View style={s.section}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text></View>; }
function Empty({ title, body }: { title: string; body: string }) { const { s } = useAppTheme(); return <View style={s.empty}><Text style={s.cardTitle}>{title}</Text><Text style={s.small}>{body}</Text></View>; }
function Field({ children }: { children: ReactNode }) { const { s } = useAppTheme(); return <Text style={s.field}>{children}</Text>; }
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { const { s } = useAppTheme(); return <Pressable style={[s.chip, selected && s.chipSelected]} onPress={onPress}><Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text></Pressable>; }
function Primary({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { const { s } = useAppTheme(); return <Pressable style={[s.primary, disabled && s.disabled]} onPress={onPress} disabled={disabled}><Text style={s.primaryText}>{label}</Text></Pressable>; }
function CalendarNavIcon({ active }: { active: boolean }) {
  const { C, s } = useAppTheme();
  const color = active ? C.accentText : C.muted;
  return <View style={s.calendarNavIcon} accessibilityElementsHidden>
    <View style={[s.calendarNavPage, { borderColor: color }, active && s.calendarNavPageActive]}>
      <View style={[s.calendarNavDivider, { backgroundColor: color }]} />
      <View style={[s.calendarNavDateLarge, { backgroundColor: color }]} />
      <View style={[s.calendarNavDateSmall, { backgroundColor: color }]} />
    </View>
    <View style={[s.calendarNavRing, s.calendarNavRingLeft, { backgroundColor: color }]} />
    <View style={[s.calendarNavRing, s.calendarNavRingRight, { backgroundColor: color }]} />
  </View>;
}

function NavButton({ label, symbol, icon, active, onPress }: { label: string; symbol?: string; icon?: 'calendar'; active: boolean; onPress: () => void }) {
  const { s } = useAppTheme();
  return <Pressable style={s.navButton} onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}>
    {icon === 'calendar' ? <CalendarNavIcon active={active} /> : <Text style={[s.navSymbol, active && s.navActive]}>{symbol}</Text>}
    <Text style={[s.navLabel, active && s.navActive]}>{label}</Text>
  </Pressable>;
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  app: { flex: 1, backgroundColor: C.paper }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.paper }, loadingText: { color: C.muted }, flex: { flex: 1 },
  locked: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 24 }, lockBrand: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 10 }, lockContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 70 }, lockSymbol: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.sagePale, color: C.accentText, fontSize: 22, lineHeight: 58, fontWeight: '900', textAlign: 'center', overflow: 'hidden' }, lockTitle: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 27, lineHeight: 34, fontWeight: '600', textAlign: 'center', marginTop: 20 }, lockCopy: { maxWidth: 340, color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }, unlockButton: { minWidth: 220, minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, marginTop: 24, paddingHorizontal: 22 }, lockHint: { maxWidth: 330, color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  topbar: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandText: { color: C.ink, fontWeight: '700', fontSize: 16 },
  brandMark: { width: 30, height: 28 }, dotOne: { position: 'absolute', width: 18, height: 18, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, top: 0 }, dotTwo: { position: 'absolute', width: 17, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, right: 0, top: 4 }, dotThree: { position: 'absolute', width: 18, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, left: 7, bottom: 0, backgroundColor: C.paper }, settings: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, settingsIcon: { color: C.accentText, fontSize: 20 },
  content: { flex: 1 }, body: { padding: 22, paddingBottom: 112 }, detailBody: { padding: 20, paddingBottom: 42 }, eyebrow: { color: C.accentText, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 6 }, title: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1 }, subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 4, marginBottom: 18 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  capture: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 23, backgroundColor: C.accentSolid, marginTop: 22, marginBottom: 8 }, plus: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.sagePale, alignItems: 'center', justifyContent: 'center' }, plusText: { color: C.accentText, fontSize: 28 }, captureTitle: { color: C.white, fontWeight: '700', fontSize: 17 }, captureSub: { color: '#FFFFFFB8', marginTop: 3, fontSize: 13 }, arrow: { color: C.white, fontSize: 30 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: C.yellow, borderRadius: 17, marginTop: 10 }, smallPrimary: { backgroundColor: C.accentSolid, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11 }, smallPrimaryText: { color: C.white, fontWeight: '700', fontSize: 12 }, section: { marginTop: 30, marginBottom: 12 }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 12 }, sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '700' }, scheduleSmall: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.sagePale }, scheduleSmallText: { color: C.accentText, fontSize: 12, fontWeight: '800' },
  taskHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 10 }, taskAdd: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: C.accentSolid }, taskAddText: { color: C.white, fontSize: 25, marginTop: -2 }, progressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: C.line }, progressFill: { height: 6, borderRadius: 3, backgroundColor: C.sage }, swipeHint: { color: C.muted, fontSize: 10, textAlign: 'center', marginVertical: 9 }, taskList: { gap: 8 },
  swipeShell: { overflow: 'hidden', borderRadius: 16, backgroundColor: C.accentSolid }, swipeUnder: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, completeReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, tomorrowReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, lockedReveal: { color: C.sagePale }, taskRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.line }, taskCheck: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: C.accentText, backgroundColor: C.card }, taskCheckDone: { borderColor: C.accentText, backgroundColor: C.accentSolid }, taskCheckText: { color: C.white, fontWeight: '900' }, taskText: { color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 }, taskDone: { color: C.muted, textDecorationLine: 'line-through' }, taskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 }, carryOverText: { color: C.muted, fontSize: 10, fontWeight: '700' }, dailyBadge: { color: C.accentText, fontSize: 10, fontWeight: '800' }, movedText: { color: C.moved, fontSize: 10, fontWeight: '800' }, tomorrowButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.sagePale }, tomorrowButtonText: { color: C.accentText, fontSize: 19, fontWeight: '800' }, lockIcon: { color: C.accentText, fontSize: 11 },
  tomorrowBox: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }, tomorrowTitle: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 9 }, tomorrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, tomorrowEdit: { flex: 1, paddingVertical: 4 }, stressDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#00000010' }, tomorrowText: { color: C.ink, fontSize: 13, fontWeight: '600' }, restoreButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: C.sagePale }, restoreText: { color: C.accentText, fontSize: 10, fontWeight: '800' }, scheduledAheadBox: { borderColor: `${C.line}99` }, scheduledTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, scheduledDate: { minWidth: 78, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: C.line }, scheduledDateText: { color: C.muted, fontSize: 10, fontWeight: '800', textAlign: 'center' }, scheduledTaskText: { color: C.muted, fontSize: 13, fontWeight: '600' }, scheduledTaskMeta: { color: C.muted, fontSize: 10, fontWeight: '700' }, scheduledChevron: { color: C.muted, fontSize: 23, opacity: .65 },
  appointmentCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, dateBlock: { width: 64, height: 68, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sagePale }, dateMonth: { color: C.accentText, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, dateDay: { color: C.accentText, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 29, fontWeight: '600' }, cardTitle: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 3 }, small: { color: C.muted, fontSize: 12, lineHeight: 17 }, reminderLine: { color: C.accentText, fontSize: 11, fontWeight: '600', marginTop: 7 }, chevron: { color: C.muted, fontSize: 28 },
  empty: { padding: 22, alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.card }, thread: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 9 }, threadMain: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 3 }, threadDot: { width: 10, height: 10, borderRadius: 5 }, threadText: { color: C.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 }, threadChevron: { color: C.muted, fontSize: 23 }, threadExplore: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: C.sagePale }, threadExploreText: { color: C.accentText, fontSize: 10, fontWeight: '800' }, tags: { color: C.muted, fontSize: 11, marginTop: 3 },
  search: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, color: C.ink, fontSize: 15 }, searchHint: { color: C.muted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 7 }, thoughtListHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, marginBottom: 10 }, thoughtList: { marginTop: 10 }, connectionToggle: { flex: 0, marginTop: 4 }, cloudCard: { padding: 14, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, marginTop: 15, overflow: 'hidden' }, cloudEmpty: { marginTop: 14 }, connectionFocus: { color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 2 }, link: { color: C.accentText, fontSize: 12, fontWeight: '700', padding: 8 }, mindMap: { height: MIND_MAP_HEIGHT, position: 'relative', marginTop: 6 }, connectionLine: { position: 'absolute', height: 2, borderRadius: 2, backgroundColor: C.sage }, focusBubble: { position: 'absolute', width: FOCUS_BUBBLE_SIZE, height: FOCUS_BUBBLE_SIZE, borderRadius: FOCUS_BUBBLE_SIZE / 2, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, borderWidth: 4, borderColor: C.sagePale, elevation: 4 }, focusLabel: { color: C.white, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }, focusBubbleText: { color: C.white, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' }, relationBubble: { position: 'absolute', width: RELATION_BUBBLE_SIZE, height: RELATION_BUBBLE_SIZE, borderRadius: RELATION_BUBBLE_SIZE / 2, padding: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.card, elevation: 2 }, relationBubbleText: { color: C.ink, fontSize: 9, lineHeight: 12, fontWeight: '800', textAlign: 'center' }, relationBubbleReason: { color: C.accentText, fontSize: 7, lineHeight: 9, fontWeight: '900', textAlign: 'center', marginTop: 3 }, noConnections: { position: 'absolute', left: 44, right: 44, bottom: 50, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 13, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, noConnectionsText: { color: C.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }, mapHint: { position: 'absolute', left: 0, right: 0, bottom: 1, color: C.muted, fontSize: 8, fontWeight: '700', textAlign: 'center' },
  scheduleAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: C.accentSolid, paddingHorizontal: 18 }, scheduleActionText: { color: C.white, fontSize: 14, fontWeight: '800' }, calendarList: { gap: 22, marginTop: 26 }, calendarDay: { gap: 10 }, calendarDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, calendarDayDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.sage }, calendarDayLabel: { color: C.accentText, fontSize: 12, fontWeight: '800' }, calendarDayCards: { gap: 10, paddingLeft: 13, borderLeftWidth: 1, borderLeftColor: C.line }, nav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: Platform.OS === 'ios' ? 12 : 4 }, navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navSymbol: { color: C.muted, fontSize: 23 }, navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' }, navActive: { color: C.accentText, fontWeight: '800' }, calendarNavIcon: { width: 26, height: 24, transform: [{ rotate: '-2deg' }] }, calendarNavPage: { position: 'absolute', left: 2, top: 4, width: 22, height: 19, overflow: 'hidden', borderWidth: 1.7, borderRadius: 6, backgroundColor: C.card }, calendarNavPageActive: { backgroundColor: C.sagePale }, calendarNavRing: { position: 'absolute', top: 1, width: 2.5, height: 8, borderRadius: 2 }, calendarNavRingLeft: { left: 7 }, calendarNavRingRight: { right: 7 }, calendarNavDivider: { position: 'absolute', left: 0, right: 0, top: 5, height: 1.5, opacity: .72 }, calendarNavDateLarge: { position: 'absolute', left: 5, top: 10, width: 6, height: 4, borderRadius: 3 }, calendarNavDateSmall: { position: 'absolute', left: 13, top: 10, width: 3.5, height: 4, borderRadius: 2, opacity: .55 },
  back: { color: C.accentText, fontWeight: '700', marginBottom: 16, fontSize: 14 }, hero: { backgroundColor: C.accentSolid, borderRadius: 23, padding: 22 }, heroEyebrow: { color: C.white, textTransform: 'uppercase', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroTitle: { color: C.white, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 31, fontWeight: '600', marginTop: 6, marginBottom: 15 }, heroFact: { color: '#FFFFFFD1', fontSize: 14, marginBottom: 7 }, reminderPill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: C.sagePale }, reminderPillText: { color: C.accentText, fontSize: 11, fontWeight: '700' },
  planIntro: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: -4, marginBottom: 13 }, agenda: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 8 }, agendaContent: { flex: 1, paddingVertical: 2 }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.sage, alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: C.accentSolid, borderColor: C.accentText }, check: { color: C.white, fontWeight: '800' }, agendaText: { color: C.ink, fontSize: 14, lineHeight: 20 }, editHint: { color: C.muted, fontSize: 10, marginTop: 3 }, done: { color: C.muted, textDecorationLine: 'line-through' }, planAddButton: { flex: 0, marginTop: 5 }, linked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.peach, marginBottom: 8 }, detailActions: { flexDirection: 'row', gap: 9, marginTop: 28 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14 }, secondaryText: { color: C.accentText, fontWeight: '700', fontSize: 13 }, dangerButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.dangerLine, backgroundColor: C.card }, dangerText: { color: C.danger, fontWeight: '700' }, modalDanger: { flex: 0, marginTop: 10 }, modalCopy: { color: C.muted, fontSize: 13, lineHeight: 19 }, confirmPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginBottom: 14 }, confirmDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#00000012' }, confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, confirmPrimary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, paddingHorizontal: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#25322F73' }, sheet: { maxHeight: '90%', paddingTop: 8, paddingHorizontal: 22, paddingBottom: Platform.OS === 'ios' ? 24 : 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.paper }, sheetExpanded: { height: '92%', maxHeight: '92%' }, handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.handle, marginBottom: 15 }, sheetTitle: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 25, fontWeight: '600' }, close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, closeText: { color: C.muted, fontSize: 25 }, sheetScroll: { flexShrink: 1 }, sheetScrollExpanded: { flex: 1 }, sheetBody: { paddingTop: 20, paddingBottom: 10 }, field: { color: C.ink, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 14 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.ink, paddingHorizontal: 14, fontSize: 15 }, textarea: { minHeight: 105, paddingTop: 13, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 4 }, reminderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 }, suggestionChips: { flexDirection: 'row', gap: 8, paddingTop: 9, paddingBottom: 2 }, showAllLink: { alignSelf: 'flex-start' }, chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, chipSelected: { backgroundColor: C.accentSolid, borderColor: C.accentText }, chipText: { color: C.muted, fontSize: 12, fontWeight: '600' }, chipTextSelected: { color: C.white }, inputHint: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 6 }, primary: { minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, marginTop: 22 }, primaryText: { color: C.white, fontSize: 14, fontWeight: '800' }, disabled: { opacity: .45 }, thoughtToGoal: { flex: 0, marginTop: 10, backgroundColor: C.sagePale }, thoughtToGoalHint: { color: C.muted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 6, marginBottom: 2 }, sourceThoughtCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.sagePale, marginTop: 10 }, sourceThoughtLabel: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: .8, textTransform: 'uppercase', marginBottom: 2 }, sourceThoughtText: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '600' }, taskTypeChoices: { gap: 8 }, taskType: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, taskTypeSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, taskTypeTitle: { color: C.ink, fontSize: 14, fontWeight: '800', marginBottom: 2 }, dailyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: C.yellow, marginTop: 10 }, dailyNoteIcon: { color: C.accentText, fontSize: 12 }, dateRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, dateButton: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 13 }, taskDateButton: { flex: 0, marginTop: 9 }, dateLabel: { color: C.accentText, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, dateValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }, pickerWrap: { marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: C.card }, pickerDone: { color: C.accentText, fontWeight: '800', textAlign: 'right', padding: 12 },
  themeChoices: { flexDirection: 'row', gap: 8 }, themeChoice: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, themeChoiceSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, themeChoiceText: { color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' }, themeChoiceTextSelected: { color: C.accentText, fontWeight: '900' },
  reminderStatus: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.muted, marginTop: 4 }, statusDotOn: { backgroundColor: C.sage }, securitySetting: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, dailyStatusTimeSetting: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginTop: 10 }, dailyStatusTimeButton: { minWidth: 82, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.sagePale }, dailyStatusTimeText: { color: C.accentText, fontSize: 14, fontWeight: '900' }, lockDelaySetting: { padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginTop: 10 }, lockDelayChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }, lockDelayChoice: { width: '48%', minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }, lockDelayChoiceSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, lockDelayChoiceText: { color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' }, lockDelayChoiceTextSelected: { color: C.accentText, fontWeight: '900' }, spacedButton: { marginTop: 12 }, wideSecondary: { flex: 0 }, linkThoughtButton: { marginTop: 10 }, privacy: { color: C.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 15 }, privacySummary: { padding: 16, borderRadius: 16, backgroundColor: C.sagePale, borderWidth: 1, borderColor: C.line }, policyText: { color: C.muted, fontSize: 13, lineHeight: 20 }, disclaimer: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 20, padding: 14, borderRadius: 13, backgroundColor: C.yellow }, toast: { position: 'absolute', left: 24, right: 24, bottom: 94, minHeight: 48, paddingVertical: 9, paddingLeft: 14, paddingRight: 8, borderRadius: 13, backgroundColor: C.toastBackground, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20 }, toastText: { flex: 1, color: C.toastText, fontSize: 13, fontWeight: '600' }, toastAction: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: '#FFFFFF20' }, toastActionText: { color: C.white, fontSize: 12, fontWeight: '900' },
}); }
