import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Notifications from 'expo-notifications';
import * as SystemUI from 'expo-system-ui';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, Animated, Appearance, AppState as NativeAppState, BackHandler, findNodeHandle, Keyboard, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Switch, Text, TextInput, useColorScheme, useWindowDimensions, View, type LayoutChangeEvent, type TextInputProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AgendaItem, Appointment, AppState, DailyTask, EditorDraft, REMINDER_OPTIONS, Thought, dateKeyAfter,
  canPostponeTask, createEmptyState, createGoalFromThought, createTask, createTaskStep, describeCountdown, groupUpcomingAppointments, localDateFromKey, localDateKey, makeId, relatedThoughts, reminderLabel, reminderTime, removeLegacySeedData, searchThoughts, suggestedAppointments, suggestedTags, thoughtsWithTag,
  taskCarryOverLabel, taskPostponeLimit, taskStepSummary, tasksForToday, tasksForTomorrow, tasksScheduledAhead, toggleTaskCompletion, toggleTaskStep, upcomingAppointments, updateTaskSchedule, updateTaskSteps,
  type AppointmentSuggestion, type TaskRecurrence, type TaskStep, type ThoughtRelation,
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
  authenticationCanComplete, automaticUnlockShouldStart, awayDurationRequiresLock, clearPrivateNotifications, runAfterReminderCancellation,
  settingChangeStayedForeground,
} from './src/privacy-operations';
import { scrollOffsetForVisibleInput, visibleViewportBottom } from './src/keyboard-layout';
import {
  loadDailyStatusPreference, loadThemeMode, loadWidgetDetailsEnabled, saveDailyStatusEnabled, saveDailyStatusMinutes,
  saveThemeMode, saveWidgetDetailsEnabled, type ThemeMode,
} from './src/preferences';
import { DEFAULT_DAILY_STATUS_MINUTES, dateAtLocalMinutes } from './src/daily-status';
import { editorDraftHasChanges } from './src/editor-changes';
import { DARK_COLORS, LIGHT_COLORS, type ThemeColors } from './src/theme';
import { clearWidgetSnapshot, updateWidgetSnapshot } from './src/widget';
import { parseWidgetRoute, type WidgetRoute } from './src/widget-model';

type Tab = 'today' | 'thoughts' | 'appointments';
type PickerMode = 'date' | 'time' | null;
type Notice = { text: string; actionLabel?: string; onAction?: () => void };
type LockStatus = 'checking' | 'locked' | 'unlocking' | 'unlocked';

type AppTheme = { C: ThemeColors; s: ReturnType<typeof makeStyles>; bubbles: string[]; isDark: boolean; reduceMotion: boolean };
const LIGHT_THEME: AppTheme = { C: LIGHT_COLORS, s: makeStyles(LIGHT_COLORS), bubbles: [LIGHT_COLORS.sagePale, LIGHT_COLORS.peach, LIGHT_COLORS.yellow, LIGHT_COLORS.lavender, LIGHT_COLORS.blue], isDark: false, reduceMotion: false };
const AppThemeContext = createContext<AppTheme>(LIGHT_THEME);
function useAppTheme() { return useContext(AppThemeContext); }
function scheduleAccessibilityFocus(targetRef: RefObject<Text | null>, delayMs = 100) {
  let active = true;
  const timer = setTimeout(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!active || !enabled || !targetRef.current) return;
      const handle = findNodeHandle(targetRef.current);
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    });
  }, delayMs);
  return () => { active = false; clearTimeout(timer); };
}
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const taskDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
function formatDailyStatusTime(minutes: number) {
  return shortTime.format(dateAtLocalMinutes(localDateKey(), minutes));
}
function defaultAppointmentStart() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(10, 0, 0, 0);
  return value;
}
function confirmDiscardChanges(onDiscard: () => void) {
  Keyboard.dismiss();
  Alert.alert(
    'Discard unsaved changes?',
    'The changes in this form have not been saved.',
    [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard changes', style: 'destructive', onPress: onDiscard },
    ],
  );
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
  { value: 'once', title: 'Just this time', description: 'Plan it for any day; move it later only if needed.' },
  { value: 'daily', title: 'Daily essential', description: 'Returns each day and cannot be moved.' },
  { value: 'weekly', title: 'Once a week', description: 'Returns weekly · up to 2 moves.' },
  { value: 'monthly', title: 'Once a month', description: 'Returns monthly · up to 5 moves.' },
];

export default function App() {
  const deviceScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void loadThemeMode().then(setThemeMode).catch((error) => console.warn('Could not load appearance preference', error));
  }, []);
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? null : themeMode);
  }, [themeMode]);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  const resolvedScheme = themeMode === 'system' ? deviceScheme === 'dark' ? 'dark' : 'light' : themeMode;
  const theme = useMemo<AppTheme>(() => {
    const C = resolvedScheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
    return { C, s: makeStyles(C), bubbles: [C.sagePale, C.peach, C.yellow, C.lavender, C.blue], isDark: resolvedScheme === 'dark', reduceMotion };
  }, [reduceMotion, resolvedScheme]);
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
  const [widgetDetailsEnabled, setWidgetDetailsEnabledState] = useState(false);
  const widgetDetailsEnabledRef = useRef(false);
  const [widgetSettingBusy, setWidgetSettingBusy] = useState(false);
  const pendingWidgetRouteRef = useRef<WidgetRoute | null>(null);
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
  const automaticUnlockAttemptedRef = useRef(false);
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
  const editorBaselineRef = useRef<EditorDraft | null>(null);
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
    editorBaselineRef.current = null;
    void saveEditorDraft(null).catch((error) => console.warn('Could not clear encrypted editor draft', error));
  }

  function beginEditorDraft(baseline: EditorDraft) {
    discardEditorDraft();
    editorBaselineRef.current = baseline;
  }

  function requestEditorClose(kind: EditorDraft['kind'], close: () => void) {
    const draft = editorDraftRef.current;
    const baseline = editorBaselineRef.current;
    if (!draft || draft.kind !== kind || !editorDraftHasChanges(draft, baseline?.kind === kind ? baseline : null)) {
      close();
      return;
    }
    confirmDiscardChanges(close);
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
      await updateWidgetSnapshot(hydrated, widgetDetailsEnabledRef.current)
        .catch((error) => console.warn('Could not refresh the home screen widget', error));

      if (!mountedRef.current || generation !== lockGenerationRef.current || lockStatusRef.current !== 'unlocked') return;
      stateRef.current = hydrated;
      editorDraftRef.current = editorDraft;
      setState(hydrated);
      setNotificationsOn(remindersAreOn);
      setStartupError(null);
      if (editorDraft?.kind === 'thought') {
        pendingWidgetRouteRef.current = null;
        setEditingThoughtId(editorDraft.itemId);
        setThoughtModal(true);
        setTab('thoughts');
      } else if (editorDraft?.kind === 'task') {
        pendingWidgetRouteRef.current = null;
        setEditingTaskId(editorDraft.itemId);
        setTaskModal(true);
        setTab('today');
      } else if (editorDraft?.kind === 'appointment') {
        pendingWidgetRouteRef.current = null;
        setSelectedId(editorDraft.itemId);
        setAppointmentModal(true);
        setTab('appointments');
      } else if (editorDraft?.kind === 'agenda') {
        pendingWidgetRouteRef.current = null;
        setSelectedId(editorDraft.appointmentId);
        setTab('appointments');
      } else if (pendingWidgetRouteRef.current && applyWidgetRoute(pendingWidgetRouteRef.current, hydrated)) {
        // Widget routes take precedence over an older notification response.
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
    automaticUnlockAttemptedRef.current = false;
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

  function requestAutomaticUnlock() {
    if (!automaticUnlockShouldStart({
      appState: NativeAppState.currentState,
      lockEnabled: appLockEnabledRef.current,
      lockStatus: lockStatusRef.current,
      authenticating: authenticatingRef.current,
      attempted: automaticUnlockAttemptedRef.current,
    })) return;
    automaticUnlockAttemptedRef.current = true;
    void unlockApp(true);
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
    const [enabled, delayMs, dailyStatus, widgetDetails, initialUrl] = await Promise.all([
      loadAppLockEnabled(),
      loadAppLockDelayMs(),
      loadDailyStatusPreference(DEFAULT_DAILY_STATUS_MINUTES),
      loadWidgetDetailsEnabled(),
      Linking.getInitialURL(),
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
    widgetDetailsEnabledRef.current = widgetDetails;
    setWidgetDetailsEnabledState(widgetDetails);
    if (initialUrl) pendingWidgetRouteRef.current = parseWidgetRoute(initialUrl);
    await configureNotifications();
    if (!mountedRef.current) return;
    if (enabled) {
      updateLockStatus('locked');
      requestAutomaticUnlock();
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
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      const route = parseWidgetRoute(url);
      if (!route) return;
      pendingWidgetRouteRef.current = route;
      const current = stateRef.current;
      if (current && lockStatusRef.current === 'unlocked') {
        if (editorDraftRef.current) {
          pendingWidgetRouteRef.current = null;
          return;
        }
        applyWidgetRoute(route, current);
      } else if (lockStatusRef.current === 'locked') {
        requestAutomaticUnlock();
      }
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      linkingSubscription.remove();
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
        requestAutomaticUnlock();
        return;
      }
      // Cover the app before iOS captures its task-switcher snapshot. A
      // transient inactive state does not start the lock timeout.
      if (nextState === 'inactive' && appLockEnabledRef.current) {
        setAwayCover(true);
        return;
      }
      if (nextState !== 'background' || !appLockEnabledRef.current) return;
      if (lockStatusRef.current === 'locked') {
        automaticUnlockAttemptedRef.current = false;
        setAwayCover(true);
        return;
      }
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
    void updateWidgetSnapshot(next, widgetDetailsEnabledRef.current)
      .catch((error) => console.warn('Could not update the home screen widget after a change', error));
    const saving = saveState(next);
    void saving.catch((error) => Alert.alert('Could not save', String(error)));
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

  function applyWidgetRoute(route: WidgetRoute, current: AppState): boolean {
    pendingWidgetRouteRef.current = null;
    discardEditorDraft();
    setThoughtModal(false);
    setEditingThoughtId(null);
    setTaskModal(false);
    setEditingTaskId(null);
    setAppointmentModal(false);
    setPendingPostponeId(null);
    setReminderModal(false);
    setPrivacyModal(false);
    if (route.kind === 'appointment') {
      const appointment = current.appointments.find((item) => item.id === route.id);
      if (appointment) {
        setSelectedId(appointment.id);
        setTab('appointments');
        return true;
      }
    } else if (route.kind === 'goal') {
      const goal = current.tasks.find((item) => item.id === route.id);
      if (goal) {
        setSelectedId(null);
        setTab('today');
        openTask(goal);
        return true;
      }
    } else {
      setSelectedId(null);
      setTab('today');
      return true;
    }
    setSelectedId(null);
    setTab('today');
    flash('That item is no longer available');
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
        requestAutomaticUnlock();
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

  async function changeWidgetDetails(enabled: boolean) {
    if (widgetSettingBusy || enabled === widgetDetailsEnabledRef.current) return;
    setWidgetSettingBusy(true);
    try {
      await saveWidgetDetailsEnabled(enabled);
      widgetDetailsEnabledRef.current = enabled;
      setWidgetDetailsEnabledState(enabled);
      if (stateRef.current) await updateWidgetSnapshot(stateRef.current, enabled);
      flash(enabled ? 'Widget details are visible' : 'Widget is showing counts only');
    } catch (error) {
      Alert.alert('Could not change widget privacy', String(error));
    } finally {
      setWidgetSettingBusy(false);
    }
  }

  function openAppointmentEditor() {
    const appointment = stateRef.current?.appointments.find((item) => item.id === selectedId);
    beginEditorDraft({
      kind: 'appointment',
      itemId: appointment?.id ?? null,
      title: appointment?.title ?? '',
      startsAt: appointment?.startsAt ?? defaultAppointmentStart().toISOString(),
      location: appointment?.location ?? '',
      reminderMinutes: appointment?.reminderMinutes ?? 120,
    });
    setAppointmentModal(true);
  }

  function closeAppointmentEditorImmediately() {
    discardEditorDraft();
    setAppointmentModal(false);
  }

  function closeAppointmentEditor() {
    requestEditorClose('appointment', closeAppointmentEditorImmediately);
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
    beginEditorDraft({
      kind: 'thought',
      itemId: thought?.id ?? null,
      text: thought?.text ?? '',
      tags: thought?.tags.join(', ') ?? '',
      appointmentId: thought?.appointmentId ?? selectedId ?? '',
    });
    setEditingThoughtId(thought?.id ?? null);
    setThoughtModal(true);
  }

  function closeThoughtEditorImmediately() {
    discardEditorDraft();
    setThoughtModal(false);
    setEditingThoughtId(null);
  }

  function closeThoughtEditor() {
    requestEditorClose('thought', closeThoughtEditorImmediately);
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
    beginEditorDraft({
      kind: 'task',
      itemId: task?.id ?? null,
      title: task?.title ?? '',
      recurrence: task?.recurrence ?? 'once',
      scheduledFor: task?.scheduledFor ?? localDateKey(),
      steps: task?.steps ?? [],
    });
    setEditingTaskId(task?.id ?? null);
    setTaskModal(true);
  }

  function closeTaskEditorImmediately() {
    discardEditorDraft();
    setTaskModal(false);
    setEditingTaskId(null);
  }

  function closeTaskEditor() {
    requestEditorClose('task', closeTaskEditorImmediately);
  }

  function closeTaskEditorThen(afterClose: () => void) {
    requestEditorClose('task', () => {
      closeTaskEditorImmediately();
      afterClose();
    });
  }

  function saveTask(title: string, recurrence: TaskRecurrence, scheduledFor: string, steps: TaskStep[], existing?: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    let task: DailyTask;
    if (!existing) {
      task = createTask(title, recurrence, scheduledFor, new Date(), steps);
    } else {
      task = updateTaskSteps({ ...updateTaskSchedule(existing, recurrence, scheduledFor, today), title }, steps);
    }
    const tasks = existing
      ? state.tasks.map((item) => item.id === task.id ? task : item)
      : [...state.tasks, task];
    commit({ ...state, tasks });
    discardEditorDraft();
    setTaskModal(false);
    setEditingTaskId(null);
    const scheduledAhead = !existing && task.scheduledFor > today;
    flash(existing ? 'Goal updated' : scheduledAhead ? 'Goal scheduled' : recurrence === 'daily' ? 'Daily essential added' : recurrence === 'weekly' ? 'Weekly goal added' : recurrence === 'monthly' ? 'Monthly goal added' : 'Today’s goal added');
  }

  function saveTaskSteps(taskId: string, steps: TaskStep[]) {
    const current = stateRef.current;
    const task = current?.tasks.find((item) => item.id === taskId);
    if (!current || !task) return;
    const nextTask = updateTaskSteps(task, steps);
    const unchanged = nextTask.steps.length === task.steps.length
      && nextTask.steps.every((step, index) => step.id === task.steps[index]?.id && step.text === task.steps[index]?.text);
    if (unchanged) return;
    if (!commit({ ...current, tasks: current.tasks.map((item) => item.id === taskId ? nextTask : item) })) return;
    const baseline = editorBaselineRef.current;
    if (baseline?.kind === 'task' && baseline.itemId === taskId) editorBaselineRef.current = { ...baseline, steps: nextTask.steps };
    const draft = editorDraftRef.current;
    if (draft?.kind === 'task' && draft.itemId === taskId) editorDraftRef.current = { ...draft, steps: nextTask.steps };
  }

  function toggleTask(task: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    const wasDone = task.completedOn === today;
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? toggleTaskCompletion(item, today) : item) });
    flash(wasDone ? 'Goal reopened' : 'Goal completed', () => restoreTaskSnapshot(task));
  }

  function toggleStep(taskId: string, stepId: string) {
    const current = stateRef.current;
    const task = current?.tasks.find((item) => item.id === taskId);
    if (!current || !task) return;
    const today = localDateKey();
    const nextTask = toggleTaskStep(task, stepId, today);
    if (nextTask === task) return;
    commit({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? nextTask : item) });
    if (task.completedOn !== today && nextTask.completedOn === today) {
      flash('All steps done · goal completed', () => restoreTaskSnapshot(task));
    }
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
    let widgetCleanupFailed = false;
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
      try {
        await clearWidgetSnapshot();
      } catch (error) {
        widgetCleanupFailed = true;
        console.warn('Could not remove the encrypted home screen widget summary', error);
      }
      editorDraftRef.current = null;
      editorBaselineRef.current = null;
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
      if (reminderCleanupFailed || widgetCleanupFailed) {
        const reminderWarning = reminderCleanupFailed ? ' Android may still hold a scheduled or delivered reminder; clear any visible Gather Mind notification or alarm.' : '';
        const widgetWarning = widgetCleanupFailed ? ' The home-screen widget may still show its previous encrypted summary; remove the widget or clear Gather Mind’s app storage.' : '';
        Alert.alert('Local data deleted', `Your Gather Mind content was erased.${reminderWarning}${widgetWarning}`);
      } else {
        flash('All local data, widget details, and reminders were deleted');
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
      'This permanently removes every thought, goal, appointment, appointment-plan item, encrypted widget summary, and scheduled reminder from this phone. This cannot be undone.',
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
      <Text style={s.lockTitle} accessibilityRole="header">Your local data stayed untouched</Text>
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
  const appointmentEditorBaseline = editorBaselineRef.current?.kind === 'appointment' ? editorBaselineRef.current : undefined;

  return <><SafeAreaView style={[s.app, { paddingTop: topInset }]} edges={['right', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.topbar}>
      <Pressable style={s.brand} onPress={() => { setSelectedId(null); setTab('today'); }} accessibilityRole="button" accessibilityLabel="Go to Today">
        <View style={s.brandMark} importantForAccessibility="no-hide-descendants"><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View>
        <Text style={s.brandText}>Gather Mind</Text>
      </Pressable>
      <Pressable style={s.settings} onPress={() => setReminderModal(true)} accessibilityRole="button" accessibilityLabel="Settings and privacy"><Text style={s.settingsIcon} allowFontScaling={false}>⚙</Text></Pressable>
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
      {tab === 'today' && <TodayView state={state} notificationsOn={notificationsOn} onEnable={enableReminders} onCapture={() => openThought()} onAddTask={() => openTask()} onEditTask={openTask} onToggleTask={toggleTask} onToggleTaskStep={toggleStep} onPostponeTask={requestPostponeTask} onRestoreTask={restoreTask} onAddAppointment={openAppointmentEditor} onOpen={setSelectedId} />}
      {tab === 'thoughts' && <ThoughtsView thoughts={state.thoughts} onCapture={() => openThought()} onEdit={openThought} />}
      {tab === 'appointments' && <AppointmentsView appointments={state.appointments} onAdd={openAppointmentEditor} onOpen={setSelectedId} />}
      <View style={[s.nav, { height: 78 + insets.bottom, paddingBottom: Math.max(4, insets.bottom) }]}>
        <NavButton label="Today" symbol="⌂" active={tab === 'today'} onPress={() => setTab('today')} />
        <NavButton label="Appointments" icon="calendar" active={tab === 'appointments'} onPress={() => setTab('appointments')} />
        <NavButton label="Thoughts" symbol="⌘" active={tab === 'thoughts'} onPress={() => setTab('thoughts')} />
      </View>
    </>}

    <ThoughtModal visible={thoughtModal} thought={editingThought} thoughts={state.thoughts} appointments={state.appointments} hasGoal={editingThoughtHasGoal} draft={editorDraft?.kind === 'thought' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeThoughtEditor} onSave={saveThought} onTurnIntoGoal={turnThoughtIntoGoal} onDelete={deleteThought} preselectedId={selectedId ?? ''} />
    <TaskModal visible={taskModal} task={editingTask} sourceThought={editingTaskSourceThought} draft={editorDraft?.kind === 'task' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeTaskEditor} onSave={saveTask} onSaveSteps={saveTaskSteps} onDelete={deleteTask} onOpenSourceThought={(thought) => closeTaskEditorThen(() => openThought(thought))} />
    <AppointmentModal visible={appointmentModal} appointment={selected} baseline={appointmentEditorBaseline} draft={editorDraft?.kind === 'appointment' ? editorDraft : undefined} onDraftChange={updateEditorDraft} onClose={closeAppointmentEditor} onSave={upsertAppointment} />
    <SettingsModal visible={reminderModal} enabled={notificationsOn} themeMode={themeMode} dailyStatusEnabled={dailyStatusEnabled} dailyStatusMinutes={dailyStatusMinutes} dailyStatusBusy={dailyStatusBusy} widgetDetailsEnabled={widgetDetailsEnabled} widgetSettingBusy={widgetSettingBusy} appLockEnabled={appLockEnabled} appLockDelayMs={appLockDelayMs} appLockBusy={lockSettingBusy} onClose={() => setReminderModal(false)} onEnable={enableReminders} onThemeModeChange={onThemeModeChange} onDailyStatusChange={(enabled) => void changeDailyStatus(enabled)} onDailyStatusMinutesChange={(minutes) => void changeDailyStatusTime(minutes)} onWidgetDetailsChange={(enabled) => void changeWidgetDetails(enabled)} onAppLockChange={(enabled) => void changeAppLock(enabled)} onAppLockDelayChange={(delayMs) => void changeAppLockDelay(delayMs)} onPrivacy={() => { setReminderModal(false); setPrivacyModal(true); }} onDeleteAll={confirmDeleteAllData} />
    <PrivacyModal visible={privacyModal} onClose={() => setPrivacyModal(false)} onDeleteAll={confirmDeleteAllData} />
    <PostponeModal visible={!!pendingTask} task={pendingTask} onClose={() => setPendingPostponeId(null)} onConfirm={() => pendingTask && postponeTask(pendingTask)} />
    {!!notice && <View style={[s.toast, { bottom: 94 + insets.bottom }]}><Text style={s.toastText} accessibilityLiveRegion="polite">{notice.text}</Text>{notice.onAction && <Pressable style={s.toastAction} onPress={runNoticeAction} accessibilityRole="button" accessibilityLabel={`${notice.actionLabel}: ${notice.text}`}><Text style={s.toastActionText}>{notice.actionLabel}</Text></Pressable>}</View>}
  </SafeAreaView><Modal visible={awayCover} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => undefined}><PrivacyCover topInset={topInset} /></Modal></>;
}

function PrivacyCover({ topInset }: { topInset: number }) {
  const { C, s, isDark } = useAppTheme();
  return <SafeAreaView style={[s.locked, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.lockBrand}><View style={s.brandMark}><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View><Text style={s.brandText}>Gather Mind</Text></View>
    <View style={s.lockContent}><Text style={s.lockSymbol} allowFontScaling={false}>●</Text><Text style={s.lockTitle} accessibilityRole="header">Your mind is gathered safely.</Text></View>
  </SafeAreaView>;
}

function LockedScreen({ topInset, unlocking, onUnlock }: { topInset: number; unlocking: boolean; onUnlock: () => void }) {
  const { C, s, isDark } = useAppTheme();
  return <SafeAreaView style={[s.locked, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} backgroundColor={C.paper} translucent />
    <View style={s.lockBrand}><View style={s.brandMark}><View style={s.dotOne} /><View style={s.dotTwo} /><View style={s.dotThree} /></View><Text style={s.brandText}>Gather Mind</Text></View>
    <View style={s.lockContent}>
      <Text style={s.lockSymbol} allowFontScaling={false}>●</Text>
      <Text style={s.lockTitle} accessibilityRole="header">Your mind is gathered safely.</Text>
      <Text style={s.lockCopy}>Unlock with your phone’s fingerprint, face recognition, or secure device fallback. Your data remains encrypted on this phone.</Text>
      <Pressable style={[s.unlockButton, unlocking && s.disabled]} onPress={onUnlock} disabled={unlocking} accessibilityRole="button" accessibilityLabel="Unlock Gather Mind">
        {unlocking ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryText}>Unlock Gather Mind</Text>}
      </Pressable>
      <Text style={s.lockHint}>If you removed every enrolled biometric, add one again in your phone settings before unlocking.</Text>
    </View>
  </SafeAreaView>;
}

function TodayView({ state, notificationsOn, onEnable, onCapture, onAddTask, onEditTask, onToggleTask, onToggleTaskStep, onPostponeTask, onRestoreTask, onAddAppointment, onOpen }: { state: AppState; notificationsOn: boolean; onEnable: () => void; onCapture: () => void; onAddTask: () => void; onEditTask: (task: DailyTask) => void; onToggleTask: (task: DailyTask) => void; onToggleTaskStep: (taskId: string, stepId: string) => void; onPostponeTask: (task: DailyTask) => void; onRestoreTask: (task: DailyTask) => void; onAddAppointment: () => void; onOpen: (id: string) => void }) {
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
    <Text style={s.title} accessibilityRole="header">One thing at a time.</Text>
    <Pressable style={s.capture} onPress={onCapture} accessibilityRole="button" accessibilityLabel="Capture a thought" accessibilityHint="Opens quick thought capture"><View style={s.plus} importantForAccessibility="no-hide-descendants"><Text style={s.plusText} allowFontScaling={false}>+</Text></View><View style={s.flex}><Text style={s.captureTitle}>What’s on your mind?</Text><Text style={s.captureSub}>Catch it now. Sort it later.</Text></View><Text style={s.arrow} allowFontScaling={false}>›</Text></Pressable>
    {!notificationsOn && <View style={s.nudge}><View style={s.flex}><Text style={s.cardTitle}>Make reminders dependable</Text><Text style={s.small}>Allow the phone to alert you even when Gather Mind is closed.</Text></View><Pressable style={s.smallPrimary} onPress={onEnable} accessibilityRole="button" accessibilityLabel="Enable appointment reminders"><Text style={s.smallPrimaryText}>Enable</Text></Pressable></View>}
    <View style={s.taskHeading}><View style={s.flex}><Text style={s.eyebrow}>Today’s gentle list</Text><Text style={s.sectionTitle} accessibilityRole="header">{completed} of {todayTasks.length} complete</Text></View><CreationButton label="Goal +" accessibilityLabel="Add a goal" onPress={onAddTask} /></View>
    <View style={s.progressTrack} accessible={todayTasks.length > 0} importantForAccessibility={todayTasks.length ? "yes" : "no"} accessibilityRole={todayTasks.length ? "progressbar" : "none"} accessibilityLabel="Goals completed today" accessibilityValue={todayTasks.length ? { min: 0, max: todayTasks.length, now: completed, text: `${completed} of ${todayTasks.length}` } : undefined}><View style={[s.progressFill, { width: todayTasks.length ? `${Math.round(completed / todayTasks.length * 100)}%` : '0%' }]} /></View>
    <Text style={s.swipeHint}>Tap to edit · swipe right to complete · left for tomorrow</Text>
    <View style={s.taskList}>{todayTasks.length ? todayTasks.map((task) => <SwipeTaskRow key={task.id} task={task} today={today} onEdit={() => onEditTask(task)} onToggle={() => onToggleTask(task)} onToggleStep={(stepId) => onToggleTaskStep(task.id, stepId)} onPostpone={() => onPostponeTask(task)} />) : <Empty title="A clear day" body="Add one small goal when you’re ready." />}</View>
    {!!tomorrowTasks.length && <View style={s.tomorrowBox}><Text style={s.tomorrowTitle} accessibilityRole="header">Waiting for tomorrow</Text>{tomorrowTasks.map((task) => <View style={s.tomorrowRow} key={`tomorrow-${task.id}`}><View style={[s.stressDot, { backgroundColor: taskColor(task.offsetCount, C) }]} importantForAccessibility="no" /><Pressable style={s.tomorrowEdit} onPress={() => onEditTask(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}, ${task.offsetCount > 0 ? taskMoveCountLabel(task) : `${taskRecurrenceName(task.recurrence)}, starts tomorrow`}`}><Text style={s.tomorrowText}>{task.title}</Text>{task.offsetCount > 0 ? <Text style={s.movedText}>{taskMoveCountLabel(task)}</Text> : <Text style={s.dailyBadge}>{taskRecurrenceName(task.recurrence)} · starts tomorrow</Text>}</Pressable>{task.offsetCount > 0 && <Pressable style={s.restoreButton} onPress={() => onRestoreTask(task)} accessibilityRole="button" accessibilityLabel={`Bring ${task.title} back to today`}><Text style={s.restoreText}>↶ Today</Text></Pressable>}</View>)}</View>}
    {!!scheduledAhead.length && <View style={[s.tomorrowBox, s.scheduledAheadBox]}><Text style={s.tomorrowTitle} accessibilityRole="header">Scheduled ahead</Text>{scheduledAhead.map((task) => <Pressable style={s.scheduledTaskRow} key={`scheduled-${task.id}`} onPress={() => onEditTask(task)} accessibilityRole="button" accessibilityLabel={`Edit ${task.title}, scheduled ${taskDate.format(localDateFromKey(task.scheduledFor))}`}><View style={s.scheduledDate}><Text style={s.scheduledDateText}>{taskDate.format(localDateFromKey(task.scheduledFor))}</Text></View><View style={s.flex}><Text style={s.scheduledTaskText}>{task.title}</Text><Text style={s.scheduledTaskMeta}>{taskRecurrenceName(task.recurrence)}</Text></View><Text style={s.scheduledChevron} allowFontScaling={false}>›</Text></Pressable>)}</View>}
    <View style={s.sectionAction}><View style={s.flex}><Text style={s.eyebrow}>Coming up</Text><Text style={s.sectionTitle} accessibilityRole="header">Your next appointment</Text></View><CreationButton label="Appointment +" accessibilityLabel="Add an appointment" onPress={onAddAppointment} /></View>
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
  if (task.recurrence === 'daily') return 'Daily · stays today';
  const limit = taskPostponeLimit(task.recurrence);
  return `${taskRecurrenceName(task.recurrence)} · ${task.offsetCount > 0 ? `moved ${task.offsetCount}/${limit}` : `up to ${limit} moves`}`;
}

function SwipeTaskRow({ task, today, onEdit, onToggle, onToggleStep, onPostpone }: { task: DailyTask; today: string; onEdit: () => void; onToggle: () => void; onToggleStep: (stepId: string) => void; onPostpone: () => void }) {
  const { C, s, reduceMotion } = useAppTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const isDone = task.completedOn === today;
  const carryOverLabel = taskCarryOverLabel(task, today);
  const metaLabel = taskMetaLabel(task);
  const stepSummary = taskStepSummary(task, today);
  const completedStepIds = new Set(stepSummary.completedStepIds);
  const hasSteps = stepSummary.total > 0;
  const cannotPostpone = !canPostponeTask(task) || isDone;
  useEffect(() => { if (isDone) setStepsExpanded(false); }, [isDone]);
  function toggleStepsExpanded() {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setStepsExpanded((expanded) => !expanded);
  }
  function finishSwipe(toValue: number, action: () => void) {
    translateX.stopAnimation();
    if (reduceMotion) {
      translateX.setValue(0);
      action();
      return;
    }
    Animated.sequence([
      Animated.timing(translateX, { toValue, duration: 100, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) action(); });
  }
  function resetSwipe(bounciness = 0) {
    translateX.stopAnimation();
    if (reduceMotion) {
      translateX.setValue(0);
      return;
    }
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness }).start();
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
        resetSwipe(7);
      }
    },
    onPanResponderTerminate: () => resetSwipe(),
  }), [cannotPostpone, onPostpone, onToggle, reduceMotion, translateX]);

  return <View style={s.swipeShell}>
    <View style={s.swipeUnder} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Text style={s.completeReveal}>{isDone ? '↶ Reopen' : '✓ Complete'}</Text><Text style={[s.tomorrowReveal, cannotPostpone && s.lockedReveal]}>{isDone ? 'Completed stays today' : task.recurrence === 'daily' ? 'Daily stays today' : !canPostponeTask(task) ? 'Move limit reached' : 'Tomorrow →'}</Text></View>
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      <View style={[s.taskRow, { backgroundColor: isDone ? C.sagePale : taskColor(task.offsetCount, C) }]}>
        <View style={s.taskMainRow}>
          {hasSteps ? <Pressable style={s.taskCheckTarget} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel={isDone ? `Reopen ${task.title}` : `Complete ${task.title} directly, ${stepSummary.completed} of ${stepSummary.total} steps checked`}><View style={[s.taskProgressBadge, isDone && s.taskCheckDone]} importantForAccessibility="no-hide-descendants"><Text style={[s.taskProgressBadgeText, isDone && s.taskCheckText]} allowFontScaling={false}>{isDone ? '✓' : `${stepSummary.completed}/${stepSummary.total}`}</Text></View></Pressable>
            : <Pressable style={s.taskCheckTarget} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel={`${task.title}, goal`}><View style={[s.taskCheck, isDone && s.taskCheckDone]} importantForAccessibility="no-hide-descendants"><Text style={s.taskCheckText} allowFontScaling={false}>{isDone ? '✓' : ''}</Text></View></Pressable>}
          <View style={s.flex}>
            <Pressable style={s.taskEditTarget} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit goal: ${task.title}${carryOverLabel ? `. ${carryOverLabel}` : ''}${metaLabel ? `. ${metaLabel}` : ''}`} accessibilityHint="Opens the goal editor" accessibilityActions={!cannotPostpone ? [{ name: 'moveToTomorrow', label: 'Move to tomorrow' }] : undefined} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'moveToTomorrow') onPostpone(); }}><Text style={[s.taskText, isDone && s.taskDone]}>{task.title}</Text><View style={s.taskMeta}>{!!carryOverLabel && <Text style={s.carryOverText}>{carryOverLabel}</Text>}{!!metaLabel && <Text style={task.recurrence === 'once' ? s.movedText : s.dailyBadge}>{metaLabel}</Text>}</View></Pressable>
          </View>
          {!canPostponeTask(task) && !isDone && <Text style={s.lockIcon} accessibilityLabel={task.recurrence === 'daily' ? 'Cannot be moved to tomorrow' : 'Move limit reached'} allowFontScaling={false}>◆</Text>}
        </View>
        {hasSteps && <View style={s.taskStepsSection}>
          <Pressable disabled={isDone} style={({ pressed }) => [s.taskStepSummary, pressed && s.taskStepSummaryPressed]} onPress={toggleStepsExpanded} accessibilityRole="button" accessibilityState={{ expanded: stepsExpanded, disabled: isDone }} accessibilityLabel={isDone ? `${stepSummary.completed} of ${stepSummary.total} goal steps checked` : stepsExpanded ? `Hide ${stepSummary.total} goal steps` : `Show ${stepSummary.total} goal steps`} accessibilityHint={isDone ? undefined : 'Shows or hides the smaller steps below'}>
            <View style={s.taskStepProgressTrack} importantForAccessibility="no-hide-descendants"><View style={[s.taskStepProgressFill, { width: `${Math.round(stepSummary.completed / stepSummary.total * 100)}%` }]} /></View>
            <Text style={s.taskStepSummaryText}>{stepSummary.completed} of {stepSummary.total} steps{!isDone && stepSummary.nextStep ? ` · Next: ${stepSummary.nextStep.text}` : ' checked'}</Text>
            {!isDone && <View style={s.taskStepDisclosure} importantForAccessibility="no-hide-descendants"><MaterialIcons name={stepsExpanded ? 'expand-less' : 'expand-more'} size={24} color={C.ink} /></View>}
          </Pressable>
          {stepsExpanded && !isDone && <View style={s.taskStepsList}>{task.steps.map((step) => {
            const checked = completedStepIds.has(step.id);
            return <Pressable key={step.id} style={s.taskStepRow} onPress={() => onToggleStep(step.id)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${step.text}, goal step`}>
              <View style={[s.taskStepCheck, checked && s.taskStepCheckDone]} importantForAccessibility="no-hide-descendants"><Text style={s.taskStepCheckText} allowFontScaling={false}>{checked ? '✓' : ''}</Text></View>
              <Text style={[s.taskStepText, checked && s.taskStepTextDone]}>{step.text}</Text>
            </Pressable>;
          })}</View>}
        </View>}
      </View>
    </Animated.View>
  </View>;
}

function ThoughtsView({ thoughts, onCapture, onEdit }: { thoughts: Thought[]; onCapture: () => void; onEdit: (thought: Thought) => void }) {
  const { C, s, bubbles } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const connectionHeadingRef = useRef<Text | null>(null);
  const listHeadingRef = useRef<Text | null>(null);
  const previousConnectionsRef = useRef(false);
  const previousConnectionFocusRef = useRef<string | null>(null);
  const matches = useMemo(() => (selectedTag ? thoughtsWithTag(thoughts, selectedTag) : searchThoughts(thoughts, query)).slice(0, 12), [thoughts, query, selectedTag]);
  const popularTags = useMemo(() => suggestedTags(thoughts), [thoughts]);
  const focus = thoughts.find((thought) => thought.id === focusId) ?? matches[0];
  const relations = useMemo(() => focus ? relatedThoughts(thoughts, focus.id) : [], [focus?.id, thoughts]);
  useEffect(() => {
    const previous = previousConnectionsRef.current;
    previousConnectionsRef.current = showConnections;
    if (previous === showConnections) return;
    if (showConnections) {
      previousConnectionFocusRef.current = null;
      return;
    }
    return scheduleAccessibilityFocus(listHeadingRef);
  }, [showConnections]);
  useEffect(() => {
    if (!showConnections || !focus) {
      previousConnectionFocusRef.current = focus?.id ?? null;
      return;
    }
    if (previousConnectionFocusRef.current === focus.id) return;
    previousConnectionFocusRef.current = focus.id;
    return scheduleAccessibilityFocus(connectionHeadingRef);
  }, [focus?.id, showConnections]);
  function exploreThought(thought: Thought) {
    setFocusId(thought.id);
    setShowConnections(true);
    Keyboard.dismiss();
  }
  function changeQuery(value: string) {
    setQuery(value);
    setSelectedTag(null);
    setFocusId(null);
    setShowConnections(false);
  }
  function toggleTag(tag: string) {
    const clearing = selectedTag === tag;
    setSelectedTag(clearing ? null : tag);
    setQuery(clearing ? '' : tag);
    setFocusId(null);
    setShowConnections(false);
  }
  return <ScrollView style={s.content} contentContainerStyle={[s.body, { paddingBottom: 112 + bottom }]} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>Find what you caught</Text><Text style={s.title} accessibilityRole="header">Thoughts</Text><Text style={s.subtitle}>Search, revisit, and connect what was on your mind. Everything stays on this phone.</Text>
    <View style={s.thoughtCreate}><CreationButton label="Thought +" accessibilityLabel="Add a thought" onPress={onCapture} /></View>
    <View style={s.searchField}>
      <MaterialIcons name="search" size={22} color={C.muted} importantForAccessibility="no" />
      <TextInput style={s.searchInput} value={query} onChangeText={changeQuery} placeholder="Try “meeting”, “sleep”, or “work”" placeholderTextColor={C.muted} accessibilityRole="search" accessibilityLabel="Search thoughts" accessibilityHint="Type words to search thought text and themes" />
    </View>
    {!!popularTags.length && <><Text style={s.searchHint}>Saved themes</Text><ScrollView horizontal showsHorizontalScrollIndicator accessibilityRole="toolbar" accessibilityLabel="Filter by saved theme" keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>{popularTags.map((tag) => <Chip key={tag} label={tag} selected={selectedTag === tag} selectionMode="toggle" accessibilityLabel={`Filter by theme ${tag}`} onPress={() => toggleTag(tag)} />)}</ScrollView></>}
    <View style={s.thoughtListHeading}><View style={s.flex}><Text style={s.eyebrow}>{query.trim() ? 'Search results' : 'Recently caught'}</Text><Text ref={listHeadingRef} style={s.sectionTitle} accessibilityRole="header" accessibilityLiveRegion="polite">{matches.length} {matches.length === 1 ? 'thought' : 'thoughts'}</Text></View></View>
    {showConnections && !!focus && <Pressable style={[s.secondary, s.connectionToggle]} onPress={() => setShowConnections(false)} accessibilityRole="button"><Text style={s.secondaryText}>Back to thought list</Text></Pressable>}
    {showConnections && focus && <>
      <View style={s.cloudCard}><View style={s.between}><View style={s.flex}><Text style={s.small}>Connections around</Text><Text ref={connectionHeadingRef} style={s.connectionFocus} accessibilityRole="header">{focus.text}</Text></View><Pressable style={s.textButton} onPress={() => onEdit(focus)} accessibilityRole="button" accessibilityLabel={`Edit focused thought: ${focus.text}`}><Text style={s.link}>Edit</Text></Pressable></View><MindMap focus={focus} relations={relations} onExplore={setFocusId} onEdit={() => onEdit(focus)} /></View>
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
  const { fontScale } = useWindowDimensions();
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
  if (fontScale >= 1.2) return <View style={s.largeTextMapFallback}>
    <Text style={s.small}>The visual map is simplified at this text size. Every connection and its reason is available in the list below.</Text>
    <Pressable style={[s.secondary, s.largeTextMapButton]} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit focused thought: ${focus.text}`}><Text style={s.secondaryText}>Edit focused thought</Text></Pressable>
  </View>;
  return <View style={s.mindMap} onLayout={measure}>
    {!!width && relations.map((relation, index) => {
      const position = positions[index];
      const targetX = position.left + RELATION_BUBBLE_SIZE / 2;
      const targetY = position.top + RELATION_BUBBLE_SIZE / 2;
      const length = Math.hypot(targetX - focusX, targetY - focusY);
      const angle = Math.atan2(targetY - focusY, targetX - focusX) * 180 / Math.PI;
      return <View key={`line-${relation.thought.id}`} pointerEvents="none" style={[s.connectionLine, { width: length, left: (focusX + targetX - length) / 2, top: (focusY + targetY) / 2, opacity: Math.min(.78, .3 + relation.score * .05), transform: [{ rotate: `${angle}deg` }] }]} />;
    })}
    <Pressable style={[s.focusBubble, { left: Math.max(0, focusX - FOCUS_BUBBLE_SIZE / 2), top: focusY - FOCUS_BUBBLE_SIZE / 2 }]} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Focused thought. Edit thought: ${focus.text}`}>
      <Text style={s.focusLabel}>Focus</Text><Text style={s.focusBubbleText} numberOfLines={4}>{focus.text}</Text>
    </Pressable>
    {!!width && relations.map((relation, index) => <Pressable key={relation.thought.id} style={[s.relationBubble, positions[index], { backgroundColor: bubbles[index % bubbles.length] }]} onPress={() => onExplore(relation.thought.id)} accessibilityRole="button" accessibilityLabel={`Explore related thought: ${relation.thought.text}. ${relationSummary(relation)}`} accessibilityHint="Makes this thought the center of the map">
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
    <Text style={s.eyebrow}>Be ready</Text><Text style={s.title} accessibilityRole="header">Appointments</Text>
    <Text style={s.subtitle}>A dated agenda for the time, place, questions, documents, decisions, and follow-ups you want together.</Text>
    <Pressable style={s.scheduleAction} onPress={onAdd} accessibilityRole="button" accessibilityLabel="Schedule a new appointment"><Text style={s.scheduleActionText}>+ Schedule an appointment</Text></Pressable>
    <View style={s.calendarList}>{groups.length ? groups.map((group) => <View key={group.dateKey} style={s.calendarDay}><View style={s.calendarDayHeader}><View style={s.calendarDayDot} importantForAccessibility="no" /><Text style={s.calendarDayLabel} accessibilityRole="header">{calendarDayLabel(group.appointments[0].startsAt)}</Text></View><View style={s.calendarDayCards}>{group.appointments.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} linkedCount={0} onPress={() => onOpen(appointment.id)} />)}</View></View>) : <Empty title="Nothing scheduled" body="Use “Schedule an appointment” to choose a date, time, place, and reminder." />}</View>
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
  const headingRef = useRef<Text | null>(null);
  const [planModal, setPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const editingPlanItem = appointment.agenda.find((item) => item.id === editingPlanId);
  useEffect(() => {
    if (draft?.appointmentId === appointment.id) {
      setEditingPlanId(draft.itemId);
      setPlanModal(true);
    }
  }, [appointment.id, draft]);
  useEffect(() => scheduleAccessibilityFocus(headingRef), [appointment.id]);
  function openPlanItem(item?: AgendaItem) { onDraftDiscard(); setEditingPlanId(item?.id ?? null); setPlanModal(true); }
  function closePlanItemImmediately() { onDraftDiscard(); setPlanModal(false); setEditingPlanId(null); }
  function savePlanItem(text: string) {
    const agenda = editingPlanItem
      ? appointment.agenda.map((item) => item.id === editingPlanItem.id ? { ...item, text } : item)
      : [...appointment.agenda, { id: makeId('agenda'), text, done: false }];
    onChange({ ...appointment, agenda });
    closePlanItemImmediately();
  }
  function deletePlanItem(item: AgendaItem) {
    Alert.alert('Remove this plan item?', 'It will no longer appear with this appointment.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        onChange({ ...appointment, agenda: appointment.agenda.filter((other) => other.id !== item.id) });
        closePlanItemImmediately();
      } },
    ]);
  }
  return <><ScrollView style={s.content} contentContainerStyle={[s.detailBody, { paddingBottom: 42 + bottom }]} keyboardShouldPersistTaps="handled">
    <Pressable style={s.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to appointments"><Text style={s.back}>‹ Appointments</Text></Pressable>
    <View style={s.hero}><Text style={s.heroEyebrow}>{describeCountdown(appointment.startsAt)}</Text><Text ref={headingRef} style={s.heroTitle} accessibilityRole="header">{appointment.title}</Text><Text style={s.heroFact}>{fullDate.format(new Date(appointment.startsAt))}</Text>{!!appointment.location && <Text style={s.heroFact} accessibilityLabel={`Place or person: ${appointment.location}`}>⌖  {appointment.location}</Text>}<View style={s.reminderPill}><Text style={s.reminderPillText}>{appointment.notificationId ? `Reminder set · ${reminderLabel(appointment.reminderMinutes)} before` : 'Reminder off'}</Text></View></View>
    <Section eyebrow="Prepare your way" title="Appointment plan" />
    <Text style={s.planIntro}>Questions, decisions, documents, things to bring, errands, or follow-ups—keep whatever helps you feel prepared.</Text>
    {appointment.agenda.length ? appointment.agenda.map((item) => <View key={item.id} style={s.agenda}><Pressable style={s.checkboxTarget} onPress={() => onChange({ ...appointment, agenda: appointment.agenda.map((other) => other.id === item.id ? { ...other, done: !other.done } : other) })} accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={`${item.text}, appointment plan item`}><View style={[s.checkbox, item.done && s.checkboxDone]} importantForAccessibility="no-hide-descendants">{item.done && <Text style={s.check} allowFontScaling={false}>✓</Text>}</View></Pressable><Pressable style={s.agendaContent} onPress={() => openPlanItem(item)} accessibilityRole="button" accessibilityLabel={`Edit appointment plan item: ${item.text}`}><Text style={[s.agendaText, item.done && s.done]}>{item.text}</Text><Text style={s.editHint}>Tap to edit</Text></Pressable></View>) : <Empty title="Your plan is open" body="Add anything you want to remember before, during, or after this appointment." />}
    <Pressable style={[s.secondary, s.planAddButton]} onPress={() => openPlanItem()} accessibilityRole="button"><Text style={s.secondaryText}>+ Add to appointment plan</Text></Pressable>
    <Section eyebrow="From your thoughts" title="Linked thoughts" />
    {thoughts.length ? thoughts.map((thought) => <Pressable key={thought.id} style={s.linked} onPress={() => onEditThought(thought)} accessibilityRole="button" accessibilityLabel={`Edit linked thought: ${thought.text}`}><View style={s.flex}><Text style={s.threadText}>{thought.text}</Text><Text style={s.editHint}>Tap to edit</Text></View><Text style={s.threadChevron} allowFontScaling={false}>›</Text></Pressable>) : <Empty title="No linked thoughts" body="Link a thought when you capture it, or add one here." />}
    <Pressable style={[s.secondary, s.linkThoughtButton]} onPress={onAddThought} accessibilityRole="button"><Text style={s.secondaryText}>+ Add a linked thought</Text></Pressable>
    <View style={s.detailActions}><Pressable style={s.secondary} onPress={onEdit} accessibilityRole="button"><Text style={s.secondaryText}>Edit details</Text></Pressable><Pressable style={s.dangerButton} onPress={onDelete} accessibilityRole="button"><Text style={s.dangerText}>Delete</Text></Pressable></View>
  </ScrollView><AgendaItemModal visible={planModal} appointmentId={appointment.id} item={editingPlanItem} draft={draft} onDraftChange={onDraftChange} onClose={closePlanItemImmediately} onSave={savePlanItem} onDelete={deletePlanItem} /></>;
}

function AgendaItemModal({ visible, appointmentId, item, draft, onDraftChange, onClose, onSave, onDelete }: { visible: boolean; appointmentId: string; item?: AgendaItem; draft?: Extract<EditorDraft, { kind: 'agenda' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (text: string) => void; onDelete: (item: AgendaItem) => void }) {
  const { C, s } = useAppTheme();
  const planItemLabelId = useId();
  const [text, setText] = useState('');
  const itemId = item?.id ?? draft?.itemId ?? null;
  useEffect(() => { if (visible) setText(draft?.text ?? item?.text ?? ''); }, [visible, item, draft]);
  function changeText(next: string) {
    setText(next);
    onDraftChange({ kind: 'agenda', appointmentId, itemId, text: next });
  }
  function requestClose() {
    const current: EditorDraft = { kind: 'agenda', appointmentId, itemId, text };
    const baseline: EditorDraft = { kind: 'agenda', appointmentId, itemId: item?.id ?? null, text: item?.text ?? '' };
    if (editorDraftHasChanges(current, baseline)) confirmDiscardChanges(onClose);
    else onClose();
  }
  return <Sheet visible={visible} onClose={requestClose} eyebrow={item ? 'Edit plan item' : 'Appointment plan'} title={item ? 'Update this item' : 'What do you want to remember?'} expanded>
    <Text style={s.modalCopy}>This can be a question, decision, document, thing to bring, errand, or follow-up.</Text>
    <Field nativeID={planItemLabelId}>Plan item</Field><SheetTextInput style={[s.input, s.textarea]} value={text} onChangeText={changeText} placeholder="Write it in your own words" placeholderTextColor={C.muted} accessibilityLabel="Plan item" accessibilityLabelledBy={planItemLabelId} multiline autoFocus />
    <Primary label={item ? 'Save changes' : 'Add to appointment plan'} onPress={() => onSave(text.trim())} disabled={!text.trim()} />
    {item && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(item)} accessibilityRole="button"><Text style={s.dangerText}>Remove plan item</Text></Pressable>}
  </Sheet>;
}

function TaskModal({ visible, task, sourceThought, draft, onDraftChange, onClose, onSave, onSaveSteps, onDelete, onOpenSourceThought }: { visible: boolean; task?: DailyTask; sourceThought?: Thought; draft?: Extract<EditorDraft, { kind: 'task' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (title: string, recurrence: TaskRecurrence, scheduledFor: string, steps: TaskStep[], existing?: DailyTask) => void; onSaveSteps: (taskId: string, steps: TaskStep[]) => void; onDelete: (task: DailyTask) => void; onOpenSourceThought: (thought: Thought) => void }) {
  const { C, s } = useAppTheme();
  const goalTitleLabelId = useId();
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('once');
  const [scheduledFor, setScheduledFor] = useState(localDateKey());
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const itemId = task?.id ?? draft?.itemId ?? null;
  const today = localDateKey();
  const tomorrow = dateKeyAfter(today, 1);
  const scheduledRecurrence = recurrence !== 'once';
  const calendarRecurrence = recurrence === 'weekly' || recurrence === 'monthly';
  useEffect(() => {
    if (visible) {
      setTitle(draft?.title ?? task?.title ?? '');
      setRecurrence(draft?.recurrence ?? task?.recurrence ?? 'once');
      setScheduledFor(draft?.scheduledFor ?? task?.scheduledFor ?? today);
      const restoredSteps = draft?.steps ?? task?.steps ?? [];
      setSteps(restoredSteps);
      setShowSteps(restoredSteps.length > 0);
      setFocusStepId(null);
      setShowDatePicker(false);
    }
  }, [visible, task, draft, today]);
  function changeTitle(next: string) { setTitle(next); onDraftChange({ kind: 'task', itemId, title: next, recurrence, scheduledFor, steps }); }
  function changeRecurrence(next: TaskRecurrence) {
    const nextDate = scheduledFor < today ? today : scheduledFor;
    setRecurrence(next);
    setScheduledFor(nextDate);
    setShowDatePicker(false);
    onDraftChange({ kind: 'task', itemId, title, recurrence: next, scheduledFor: nextDate, steps });
  }
  function changeScheduleDate(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed' || !value) return;
    const next = localDateKey(value);
    setScheduledFor(next);
    onDraftChange({ kind: 'task', itemId, title, recurrence, scheduledFor: next, steps });
  }
  function chooseOneOffDate(next: string) {
    setScheduledFor(next);
    setShowDatePicker(false);
    onDraftChange({ kind: 'task', itemId, title, recurrence, scheduledFor: next, steps });
  }
  function replaceSteps(next: TaskStep[]) {
    setSteps(next);
    onDraftChange({ kind: 'task', itemId, title, recurrence, scheduledFor, steps: next });
  }
  function beginSteps() {
    const firstStep = createTaskStep();
    setShowSteps(true);
    setFocusStepId(firstStep.id);
    replaceSteps([firstStep]);
  }
  function addStep() {
    const step = createTaskStep();
    setFocusStepId(step.id);
    replaceSteps([...steps, step]);
  }
  function changeStep(stepId: string, text: string) {
    replaceSteps(steps.map((step) => step.id === stepId ? { ...step, text } : step));
  }
  function removeStep(stepId: string) {
    const next = steps.filter((step) => step.id !== stepId);
    replaceSteps(next);
    if (task) onSaveSteps(task.id, preparedSteps(next));
    if (focusStepId === stepId) setFocusStepId(null);
  }
  function preparedSteps(value = steps) {
    return value.flatMap((step) => step.text.trim() ? [{ ...step, text: step.text.trim() }] : []);
  }
  function saveStepsOnBlur() {
    if (task) onSaveSteps(task.id, preparedSteps());
  }
  const scheduleLabel = task && task.recurrence === recurrence ? recurrence === 'daily' ? 'Start date' : 'Next occurrence' : 'First occurrence';
  const schedulesAhead = scheduledFor > today;
  const customPlanDate = !scheduledRecurrence && scheduledFor !== today && scheduledFor !== tomorrow;
  const pickerDate = localDateFromKey(scheduledFor < today ? today : scheduledFor);
  return <Sheet visible={visible} onClose={onClose} eyebrow={task ? 'Edit goal' : 'One manageable thing'} title={task ? 'Adjust this goal' : schedulesAhead ? 'Plan ahead' : 'Add to today'} expanded>
    <Field nativeID={goalTitleLabelId}>What would you like to do?</Field>
    <SheetTextInput style={s.input} value={title} onChangeText={changeTitle} placeholder="A small, clear goal" placeholderTextColor={C.muted} accessibilityLabel="Goal" accessibilityLabelledBy={goalTitleLabelId} autoFocus onSubmitEditing={() => title.trim() && onSave(title.trim(), recurrence, scheduledFor, preparedSteps(), task)} />
    {sourceThought && <Pressable style={s.sourceThoughtCard} onPress={() => onOpenSourceThought(sourceThought)} accessibilityRole="button" accessibilityLabel={`Open source thought: ${sourceThought.text}`}><View style={s.flex}><Text style={s.sourceThoughtLabel}>From thought</Text><Text style={s.sourceThoughtText}>{sourceThought.text}</Text></View><Text style={s.link}>Open</Text></Pressable>}
    {!showSteps ? <>
      <Pressable style={[s.secondary, s.makeSmallerButton]} onPress={beginSteps} accessibilityRole="button"><Text style={s.secondaryText}>Split into smaller steps</Text></Pressable>
      <Text style={s.makeSmallerHint}>Optional · add checkable steps inside this goal. They appear under the goal on Today, and the last one completes it.</Text>
    </> : <View style={s.stepEditor}>
      <Text style={s.stepEditorTitle} accessibilityRole="header">Steps inside this goal</Text>
      <Text style={s.small}>{task ? 'Changes save when you leave a field. Check these steps from Today; the last one completes the goal.' : 'These steps appear under the goal on Today. Checking the last one completes the goal.'}</Text>
      {steps.map((step, index) => <View style={s.stepEditorRow} key={step.id}>
        <View style={s.stepNumber} importantForAccessibility="no-hide-descendants"><Text style={s.stepNumberText} allowFontScaling={false}>{index + 1}</Text></View>
        <SheetTextInput style={[s.input, s.stepEditorInput]} value={step.text} onChangeText={(text) => changeStep(step.id, text)} onBlur={saveStepsOnBlur} placeholder={index === 0 ? 'The smallest first step' : 'Another small step'} placeholderTextColor={C.muted} accessibilityLabel={`Goal step ${index + 1}`} autoFocus={focusStepId === step.id} returnKeyType="done" />
        <Pressable style={s.removeStepButton} onPress={() => removeStep(step.id)} accessibilityRole="button" accessibilityLabel={`Remove step ${index + 1}${step.text.trim() ? `: ${step.text.trim()}` : ''}`}><Text style={s.removeStepText} allowFontScaling={false}>×</Text></Pressable>
      </View>)}
      <Pressable style={s.addStepButton} onPress={addStep} accessibilityRole="button"><Text style={s.addStepText}>+ {steps.length ? 'Add another step' : 'Add a step'}</Text></Pressable>
    </View>}
    <Field>How often?</Field>
    <View style={s.taskTypeChoices}>
      {TASK_RECURRENCE_OPTIONS.map((option) => <Pressable key={option.value} style={[s.taskType, recurrence === option.value && s.taskTypeSelected]} onPress={() => changeRecurrence(option.value)} accessibilityRole="radio" accessibilityState={{ checked: recurrence === option.value }} accessibilityLabel={`How often: ${option.title}. ${option.description}`}><Text style={s.taskTypeTitle}>{option.title}</Text><Text style={s.small}>{option.description}</Text></Pressable>)}
    </View>
    {!scheduledRecurrence && <>
      <Field>Plan for</Field>
      <Text style={s.inputHint}>Choose the day this goal should first appear on Today. Use an appointment instead when a time or reminder matters.</Text>
      <View style={s.taskPlanChoices}>
        <Pressable style={[s.taskPlanChoice, scheduledFor === today && s.taskPlanChoiceSelected]} onPress={() => chooseOneOffDate(today)} accessibilityRole="radio" accessibilityState={{ checked: scheduledFor === today }}><Text style={[s.taskPlanChoiceText, scheduledFor === today && s.taskPlanChoiceTextSelected]}>Today</Text></Pressable>
        <Pressable style={[s.taskPlanChoice, scheduledFor === tomorrow && s.taskPlanChoiceSelected]} onPress={() => chooseOneOffDate(tomorrow)} accessibilityRole="radio" accessibilityState={{ checked: scheduledFor === tomorrow }}><Text style={[s.taskPlanChoiceText, scheduledFor === tomorrow && s.taskPlanChoiceTextSelected]}>Tomorrow</Text></Pressable>
        <Pressable style={[s.taskPlanChoice, customPlanDate && s.taskPlanChoiceSelected]} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} accessibilityRole="radio" accessibilityState={{ checked: customPlanDate }} accessibilityLabel={customPlanDate ? `Choose another date, currently ${taskDate.format(localDateFromKey(scheduledFor))}` : 'Choose another date'}><Text style={[s.taskPlanChoiceText, customPlanDate && s.taskPlanChoiceTextSelected]}>Choose date</Text><Text style={[s.taskPlanChoiceDate, customPlanDate && s.taskPlanChoiceTextSelected]}>{customPlanDate ? taskDate.format(localDateFromKey(scheduledFor)) : 'Pick a day'}</Text></Pressable>
      </View>
      {showDatePicker && <View style={s.pickerWrap}><DateTimePicker value={pickerDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={localDateFromKey(today)} onChange={changeScheduleDate} />{Platform.OS === 'ios' && <Pressable style={s.pickerDoneButton} onPress={() => setShowDatePicker(false)} accessibilityRole="button"><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    </>}
    {scheduledRecurrence && <>
      <Field>{scheduleLabel}</Field>
      <Text style={s.inputHint}>{task && task.recurrence === recurrence
        ? recurrence === 'daily' ? 'Changing this date changes when the daily essential becomes active.' : `Changing this date starts a new ${recurrence} rhythm.`
        : recurrence === 'daily' ? 'The essential first appears on this date, then returns every day.' : `The goal first appears on this date, then repeats on the same ${recurrence === 'weekly' ? 'weekday' : 'calendar date'}.`}</Text>
      <Pressable style={[s.dateButton, s.taskDateButton]} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} accessibilityRole="button" accessibilityLabel={`Choose ${scheduleLabel.toLowerCase()}, currently ${taskDate.format(localDateFromKey(scheduledFor))}`}><Text style={s.dateLabel}>{scheduleLabel.toUpperCase()}</Text><Text style={s.dateValue}>{taskDate.format(localDateFromKey(scheduledFor))}</Text></Pressable>
      {showDatePicker && <View style={s.pickerWrap}><DateTimePicker value={pickerDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={localDateFromKey(today)} onChange={changeScheduleDate} />{Platform.OS === 'ios' && <Pressable style={s.pickerDoneButton} onPress={() => setShowDatePicker(false)} accessibilityRole="button"><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
      {recurrence === 'daily' && <View style={s.dailyNote}><Text style={s.dailyNoteIcon} importantForAccessibility="no" allowFontScaling={false}>◆</Text><Text style={[s.small, s.flex]}>Once active, it stays visible each day and cannot be moved to tomorrow.</Text></View>}
      {calendarRecurrence && <View style={s.dailyNote}><Text style={s.dailyNoteIcon} importantForAccessibility="no" allowFontScaling={false}>◇</Text><Text style={[s.small, s.flex]}>Its move allowance resets after each completion.</Text></View>}
    </>}
    <Primary label={task ? 'Save changes' : schedulesAhead ? 'Schedule goal' : 'Add to today'} onPress={() => onSave(title.trim(), recurrence, scheduledFor, preparedSteps(), task)} disabled={!title.trim()} />
    {task && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(task)} accessibilityRole="button"><Text style={s.dangerText}>Remove goal</Text></Pressable>}
  </Sheet>;
}

function ThoughtModal({ visible, thought, thoughts, appointments, hasGoal, draft, onDraftChange, onClose, onSave, onTurnIntoGoal, onDelete, preselectedId }: { visible: boolean; thought?: Thought; thoughts: Thought[]; appointments: Appointment[]; hasGoal: boolean; draft?: Extract<EditorDraft, { kind: 'thought' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, existing?: Thought) => void; onTurnIntoGoal: (input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, thought: Thought) => void; onDelete: (thought: Thought) => void; preselectedId: string }) {
  const { C, s } = useAppTheme();
  const thoughtLabelId = useId();
  const themesLabelId = useId();
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
    <Field nativeID={thoughtLabelId}>Thought</Field><SheetTextInput style={[s.input, s.textarea]} value={text} onChangeText={changeText} placeholder="It can be messy. Just get it out." placeholderTextColor={C.muted} accessibilityLabel="Thought" accessibilityLabelledBy={thoughtLabelId} multiline autoFocus />
    <View>
      <Field nativeID={themesLabelId}>Themes (optional)</Field><SheetTextInput style={s.input} value={tags} onChangeText={changeTags} keyboardExtraOffset={12} revealThroughRef={themeSuggestionsRef} placeholder="health, sleep, work" placeholderTextColor={C.muted} accessibilityLabel="Themes, optional" accessibilityLabelledBy={themesLabelId} />
      <SheetFocusAccessory innerRef={themeSuggestionsRef}>
        <Text style={s.inputHint}>Separate themes with commas. Saved themes appear as you type.</Text>
        {!!tagMatches.length && <ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled" accessibilityLabel="Suggested themes" contentContainerStyle={s.suggestionChips}>{tagMatches.map((tag) => <Chip key={tag} label={tag} selected={false} selectionMode="none" accessibilityLabel={`Add theme ${tag}`} onPress={() => addSuggestedTag(tag)} />)}</ScrollView>}
      </SheetFocusAccessory>
    </View>
    {!!appointments.length && <><Field>{showAllAppointments ? 'Link to an appointment (optional)' : 'Possible appointment (optional)'}</Field><Text style={s.inputHint}>Suggested from nearby dates and matching words on this phone. Nothing is linked until you choose it. Swipe horizontally for more choices.</Text><ScrollView horizontal showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled" accessibilityLabel="Appointment link choices" contentContainerStyle={s.suggestionChips}><Chip label="Not linked" selected={!appointmentId} selectionMode="radio" onPress={() => changeAppointment('')} />{appointmentChoices.map((suggestion) => <Chip key={suggestion.appointment.id} label={`${suggestion.appointment.title} · ${appointmentSuggestionReason(suggestion)}`} selected={appointmentId === suggestion.appointment.id} selectionMode="radio" onPress={() => changeAppointment(suggestion.appointment.id)} />)}</ScrollView>{appointments.length > suggestedChoices.length && <Pressable style={s.showAllLink} onPress={() => setShowAllAppointments((shown) => !shown)} accessibilityRole="button" accessibilityState={{ expanded: showAllAppointments }}><Text style={s.link}>{showAllAppointments ? 'Show nearby suggestions' : 'See all appointments'}</Text></Pressable>}</>}
    <Primary label={thought ? 'Save changes' : 'Keep this thought'} onPress={submit} disabled={!text.trim()} />
    {thought && <><Pressable style={[s.secondary, s.thoughtToGoal, hasGoal && s.disabled]} onPress={() => onTurnIntoGoal(currentInput(), thought)} disabled={hasGoal || !text.trim()} accessibilityRole="button" accessibilityState={{ disabled: hasGoal || !text.trim() }}><Text style={s.secondaryText}>{hasGoal ? 'Already added as a goal' : 'Turn into today’s goal'}</Text></Pressable><Text style={s.thoughtToGoalHint}>The original thought stays here, and the goal links back to it.</Text></>}
    {thought && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(thought)} accessibilityRole="button"><Text style={s.dangerText}>Remove thought</Text></Pressable>}
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
    <View style={s.confirmActions}><Pressable style={s.secondary} onPress={onClose} accessibilityRole="button"><Text style={s.secondaryText}>Keep on today</Text></Pressable><Pressable style={s.confirmPrimary} onPress={onConfirm} accessibilityRole="button"><Text style={s.primaryText}>Yes, tomorrow</Text></Pressable></View>
  </Sheet>;
}

function AppointmentModal({ visible, appointment, baseline, draft, onDraftChange, onClose, onSave }: { visible: boolean; appointment?: Appointment; baseline?: Extract<EditorDraft, { kind: 'appointment' }>; draft?: Extract<EditorDraft, { kind: 'appointment' }>; onDraftChange: (draft: EditorDraft) => void; onClose: () => void; onSave: (input: Omit<Appointment, 'notificationId' | 'createdAt' | 'agenda'> & { existing?: Appointment }) => void }) {
  const { C, s } = useAppTheme();
  const appointmentNameLabelId = useId();
  const locationLabelId = useId();
  const defaultDate = useMemo(defaultAppointmentStart, []);
  const [title, setTitle] = useState(''); const [location, setLocation] = useState(''); const [date, setDate] = useState(defaultDate); const [minutes, setMinutes] = useState(120); const [picker, setPicker] = useState<PickerMode>(null);
  const itemId = appointment?.id ?? draft?.itemId ?? null;
  useEffect(() => { if (visible) { setTitle(draft?.title ?? baseline?.title ?? appointment?.title ?? ''); setLocation(draft?.location ?? baseline?.location ?? appointment?.location ?? ''); setDate(new Date(draft?.startsAt ?? baseline?.startsAt ?? appointment?.startsAt ?? defaultDate)); setMinutes(draft?.reminderMinutes ?? baseline?.reminderMinutes ?? appointment?.reminderMinutes ?? 120); setPicker(null); } }, [visible, appointment, baseline, defaultDate, draft]);
  function publishDraft(next: Partial<Pick<Extract<EditorDraft, { kind: 'appointment' }>, 'title' | 'startsAt' | 'location' | 'reminderMinutes'>>) {
    onDraftChange({ kind: 'appointment', itemId, title, startsAt: date.toISOString(), location, reminderMinutes: minutes, ...next });
  }
  function changeTitle(next: string) { setTitle(next); publishDraft({ title: next }); }
  function changeLocation(next: string) { setLocation(next); publishDraft({ location: next }); }
  function changeMinutes(next: number) { setMinutes(next); publishDraft({ reminderMinutes: next }); }
  function changeDate(event: DateTimePickerEvent, value?: Date) { if (Platform.OS === 'android') setPicker(null); if (event.type !== 'dismissed' && value) { setDate(value); publishDraft({ startsAt: value.toISOString() }); } }
  function openPicker(mode: Exclude<PickerMode, null>) { Keyboard.dismiss(); setPicker(mode); }
  function submit() { if (title.trim()) onSave({ id: appointment?.id ?? makeId('appointment'), title: title.trim(), startsAt: date.toISOString(), location: location.trim(), reminderMinutes: minutes, existing: appointment }); }
  return <Sheet visible={visible} onClose={onClose} eyebrow={appointment ? 'Edit appointment' : 'New appointment'} title="When do you need to be there?" expanded>
    <Field nativeID={appointmentNameLabelId}>Appointment name</Field><SheetTextInput style={s.input} value={title} onChangeText={changeTitle} placeholder="Doctor, teacher, contractor, meeting…" placeholderTextColor={C.muted} accessibilityLabel="Appointment name" accessibilityLabelledBy={appointmentNameLabelId} autoFocus />
    <Field>Date and time</Field><View style={s.dateRow}><Pressable style={s.dateButton} onPress={() => openPicker('date')} accessibilityRole="button" accessibilityLabel={`Choose appointment date, currently ${shortDate.format(date)}`}><Text style={s.dateLabel}>DATE</Text><Text style={s.dateValue}>{shortDate.format(date)}</Text></Pressable><Pressable style={s.dateButton} onPress={() => openPicker('time')} accessibilityRole="button" accessibilityLabel={`Choose appointment time, currently ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`}><Text style={s.dateLabel}>TIME</Text><Text style={s.dateValue}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}</Text></Pressable></View>
    {!!picker && <View style={s.pickerWrap}><DateTimePicker value={date} mode={picker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={picker === 'date' ? new Date() : undefined} onChange={changeDate} />{Platform.OS === 'ios' && <Pressable style={s.pickerDoneButton} onPress={() => setPicker(null)} accessibilityRole="button"><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    <Field nativeID={locationLabelId}>Place or person (optional)</Field><SheetTextInput style={s.input} value={location} onChangeText={changeLocation} placeholder="Office, address, person, or video call" placeholderTextColor={C.muted} accessibilityLabel="Place or person, optional" accessibilityLabelledBy={locationLabelId} />
    <Field>Remind me</Field><View style={s.reminderChoices}>{REMINDER_OPTIONS.map((option) => <Chip key={option.value} label={option.label} selected={minutes === option.value} selectionMode="radio" accessibilityLabel={`Remind me ${option.label} before`} onPress={() => changeMinutes(option.value)} />)}</View>
    <Primary label={appointment ? 'Save changes' : 'Create appointment'} onPress={submit} disabled={!title.trim()} />
  </Sheet>;
}

function SettingsModal({ visible, enabled, themeMode, dailyStatusEnabled, dailyStatusMinutes, dailyStatusBusy, widgetDetailsEnabled, widgetSettingBusy, appLockEnabled, appLockDelayMs, appLockBusy, onClose, onEnable, onThemeModeChange, onDailyStatusChange, onDailyStatusMinutesChange, onWidgetDetailsChange, onAppLockChange, onAppLockDelayChange, onPrivacy, onDeleteAll }: { visible: boolean; enabled: boolean; themeMode: ThemeMode; dailyStatusEnabled: boolean; dailyStatusMinutes: number; dailyStatusBusy: boolean; widgetDetailsEnabled: boolean; widgetSettingBusy: boolean; appLockEnabled: boolean; appLockDelayMs: AppLockDelayMs; appLockBusy: boolean; onClose: () => void; onEnable: () => void; onThemeModeChange: (mode: ThemeMode) => void; onDailyStatusChange: (enabled: boolean) => void; onDailyStatusMinutesChange: (minutes: number) => void; onWidgetDetailsChange: (enabled: boolean) => void; onAppLockChange: (enabled: boolean) => void; onAppLockDelayChange: (delayMs: AppLockDelayMs) => void; onPrivacy: () => void; onDeleteAll: () => void }) {
  const { C, s } = useAppTheme();
  const [showDailyStatusTimePicker, setShowDailyStatusTimePicker] = useState(false);
  useEffect(() => { if (!visible || !dailyStatusEnabled) setShowDailyStatusTimePicker(false); }, [visible, dailyStatusEnabled]);
  function changeDailyStatusPicker(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setShowDailyStatusTimePicker(false);
    if (event.type === 'dismissed' || !value) return;
    onDailyStatusMinutesChange(value.getHours() * 60 + value.getMinutes());
  }
  return <Sheet visible={visible} onClose={onClose} eyebrow="Gather Mind 0.6.0" title="Settings & privacy">
    <Field heading>Appearance</Field>
    <View style={s.themeChoices}>{THEME_MODE_OPTIONS.map((option) => <Pressable key={option.value} style={[s.themeChoice, themeMode === option.value && s.themeChoiceSelected]} onPress={() => onThemeModeChange(option.value)} accessibilityRole="radio" accessibilityState={{ checked: themeMode === option.value }} accessibilityLabel={`Appearance: ${option.label}`}><Text style={[s.themeChoiceText, themeMode === option.value && s.themeChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
    <Text style={s.privacy}>Follow device changes automatically with your phone’s light or dark appearance.</Text>
    <Field heading>Appointment reminders</Field>
    <View style={s.reminderStatus}><View style={[s.statusDot, enabled && s.statusDotOn]} importantForAccessibility="no" /><View style={s.flex}><Text style={s.cardTitle} accessibilityLiveRegion="polite">{enabled ? 'Reminders are enabled' : 'Reminders are off'}</Text><Text style={s.small}>Scheduled locally by your phone. No account, internet connection, or backend is needed.</Text></View></View>
    {!enabled && <Primary label="Enable reminders" onPress={onEnable} />}
    <Text style={s.privacy}>Your phone may delay notifications in Focus, Do Not Disturb, or extreme battery-saving modes.</Text>
    <Field heading>Daily goals</Field>
    <View style={s.securitySetting}><View style={s.flex}><Text style={s.cardTitle}>Quiet daily status</Text><Text style={s.small}>After your chosen time, show one silent notification-list count only when today still has unfinished goals. Goal titles stay private.</Text></View><Switch style={s.switchControl} value={dailyStatusEnabled} onValueChange={onDailyStatusChange} disabled={dailyStatusBusy} trackColor={{ false: C.line, true: C.sage }} thumbColor={dailyStatusEnabled ? C.accentSolid : C.white} accessibilityLabel="Show a quiet daily status for unfinished goals" /></View>
    {dailyStatusEnabled && <View style={s.dailyStatusTimeSetting}><View style={s.flex}><Text style={s.cardTitle}>Show after</Text><Text style={s.small}>The status is refreshed locally when your goals change.</Text></View><Pressable style={[s.dailyStatusTimeButton, dailyStatusBusy && s.disabled]} onPress={() => setShowDailyStatusTimePicker(true)} disabled={dailyStatusBusy} accessibilityRole="button" accessibilityLabel={`Change quiet daily status time, currently ${formatDailyStatusTime(dailyStatusMinutes)}`}><Text style={s.dailyStatusTimeText}>{formatDailyStatusTime(dailyStatusMinutes)}</Text></Pressable></View>}
    {dailyStatusEnabled && showDailyStatusTimePicker && <View style={s.pickerWrap}><DateTimePicker value={dateAtLocalMinutes(localDateKey(), dailyStatusMinutes)} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={changeDailyStatusPicker} />{Platform.OS === 'ios' && <Pressable style={s.pickerDoneButton} onPress={() => setShowDailyStatusTimePicker(false)} accessibilityRole="button"><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    {dailyStatusEnabled && !enabled && <Text style={s.inputHint}>Android notification permission is currently off, so the quiet status cannot appear.</Text>}
    <Field heading>Home screen</Field>
    <View style={s.securitySetting}><View style={s.flex}><Text style={s.cardTitle}>Show details in the widget</Text><Text style={s.small}>The compact widget always shows today’s completed/total count. Larger sizes can also show goal titles and your next appointment.</Text></View><Switch style={s.switchControl} value={widgetDetailsEnabled} onValueChange={onWidgetDetailsChange} disabled={widgetSettingBusy} trackColor={{ false: C.line, true: C.sage }} thumbColor={widgetDetailsEnabled ? C.accentSolid : C.white} accessibilityLabel="Show goal and appointment details in the home screen widget" /></View>
    <Text style={s.privacy}>Long-press an empty area of your Android home screen and choose Widgets → Gather Mind. Details shown there are visible without unlocking Gather Mind; leave this off for counts and times only.</Text>
    <Field heading>Security</Field>
    <View style={s.securitySetting}><View style={s.flex}><Text style={s.cardTitle}>Lock Gather Mind</Text><Text style={s.small}>Ask for strong fingerprint or secure face recognition after you have left the app. Your database is encrypted whether this is on or off.</Text></View><Switch style={s.switchControl} value={appLockEnabled} onValueChange={onAppLockChange} disabled={appLockBusy} trackColor={{ false: C.line, true: C.sage }} thumbColor={appLockEnabled ? C.accentSolid : C.white} accessibilityLabel="Lock Gather Mind with biometrics" /></View>
    {appLockEnabled && <View style={s.lockDelaySetting}>
      <Text style={s.cardTitle}>Require unlock</Text>
      <Text style={s.small}>The app is covered immediately in the app switcher. Return within this time without another biometric check.</Text>
      <View style={s.lockDelayChoices}>{APP_LOCK_DELAY_OPTIONS.map((option) => <Pressable key={option.value} style={[s.lockDelayChoice, appLockDelayMs === option.value && s.lockDelayChoiceSelected, appLockBusy && s.disabled]} onPress={() => onAppLockDelayChange(option.value)} disabled={appLockBusy} accessibilityRole="radio" accessibilityState={{ checked: appLockDelayMs === option.value }}><Text style={[s.lockDelayChoiceText, appLockDelayMs === option.value && s.lockDelayChoiceTextSelected]}>{option.label}</Text></Pressable>)}</View>
    </View>}
    <Text style={s.privacy}>The encryption key stays in this device’s secure key store and is not tied to your biometric profile. Removing all enrolled biometrics can temporarily block the app until you add one again.</Text>
    <Field heading>Privacy & support</Field>
    <View style={s.privacySummary}><Text style={s.cardTitle}>Private and encrypted by default</Text><Text style={s.small}>Your content stays encrypted on this phone. Gather Mind has no account, ads, analytics, backend, or remote sync.</Text></View>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={onPrivacy} accessibilityRole="button"><Text style={s.secondaryText}>Read privacy & support</Text></Pressable>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll} accessibilityRole="button"><Text style={s.dangerText}>Delete all local data</Text></Pressable>
  </Sheet>;
}

function PrivacyModal({ visible, onClose, onDeleteAll }: { visible: boolean; onClose: () => void; onDeleteAll: () => void }) {
  const { s } = useAppTheme();
  return <Sheet visible={visible} onClose={onClose} eyebrow="Effective 23 August 2026" title="Privacy, data & support">
    <View style={s.privacySummary}><Text style={s.cardTitle}>Your data stays encrypted on your device</Text><Text style={s.small}>Gather Mind 0.6.0 does not collect, transmit, sell, or share your thoughts, goals, appointments, or usage data.</Text></View>
    <Field heading>What the app stores</Field>
    <Text style={s.policyText}>The content you enter is stored in an encrypted database in the app’s private local storage. Its random key is kept in the phone’s secure key store. The Android home-screen widget receives a bounded summary encrypted separately with Android Keystore. Its default count-and-time mode excludes titles; showing titles requires your explicit choice because home-screen content is visible without Gather Mind’s app lock. Appointment reminders and the optional generic daily goal count are scheduled by your phone’s operating system. No account, advertising, analytics, cloud sync, or backend service is used.</Text>
    <Field heading>Permissions</Field>
    <Text style={s.policyText}>Notification access is used only for appointment reminders and the optional quiet daily goal status you choose. Exact-alarm access helps Android deliver the selected local times accurately; timing can be less exact without it. If you turn on Lock Gather Mind, the biometric prompt is used only to unlock the app locally. You can deny notifications and leave both optional features off.</Text>
    <Field heading>Retention and deletion</Field>
    <Text style={s.policyText}>Data remains until you delete individual items, use the control below, clear the app’s storage, or uninstall the app. Delete all also removes the encrypted widget summary and cancels Gather Mind’s scheduled reminders. Android cloud backup is disabled for this app.</Text>
    <Field heading>Support</Field>
    <Text style={s.policyText}>For a reminder problem, check Android notifications, Special app access → Alarms & reminders, Focus, Do Not Disturb, and battery settings. Open and save the appointment again after changing permissions.</Text>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={() => void Linking.openURL('https://github.com/fezdk/gather_mind/issues')} accessibilityRole="link"><Text style={s.secondaryText}>Open GitHub support</Text></Pressable>
    <Text style={s.disclaimer}>Gather Mind is an organisational aid, not a medical device, diagnostic tool, treatment, or substitute for professional care. The source code is Apache-2.0 licensed; that software licence does not grant anyone rights to your personal content.</Text>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll} accessibilityRole="button"><Text style={s.dangerText}>Delete all local data</Text></Pressable>
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
  const { s, reduceMotion } = useAppTheme();
  const { bottom } = useSafeAreaInsets();
  const stableBottomInsetRef = useRef(bottom);
  if (!visible) stableBottomInsetRef.current = bottom;
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportRef = useRef<View | null>(null);
  const scrollOffsetRef = useRef(0);
  const focusedInputRef = useRef<{ input: TextInput; extraOffset: number; revealThrough: View | null } | null>(null);
  const titleRef = useRef<Text | null>(null);
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
  useEffect(() => {
    if (!visible || expanded) return;
    return scheduleAccessibilityFocus(titleRef, reduceMotion ? 50 : 380);
  }, [expanded, reduceMotion, visible]);
  const content = <View style={[s.sheet, expanded && s.sheetExpanded, { paddingBottom: 18 + stableBottomInsetRef.current }]} accessibilityViewIsModal onAccessibilityEscape={() => onClose()}><View style={s.handle} importantForAccessibility="no" /><View style={s.between}><View style={s.flex}><Text style={s.eyebrow}>{eyebrow}</Text><Text ref={titleRef} style={s.sheetTitle} accessibilityRole="header">{title}</Text></View><Pressable style={s.close} onPress={() => onClose()} accessibilityRole="button" accessibilityLabel="Close"><Text style={s.closeText} allowFontScaling={false}>×</Text></Pressable></View><View ref={viewportRef} style={[s.sheetScroll, expanded && s.sheetScrollExpanded]}><ScrollView ref={scrollRef} style={expanded && s.flex} contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} onScroll={(event) => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}>{children}</ScrollView></View></View>;
  return <Modal visible={visible} animationType={reduceMotion ? "none" : "slide"} transparent statusBarTranslucent navigationBarTranslucent onRequestClose={() => onClose()}><SheetInputFocusContext.Provider value={{ focus: revealFocusedInput, refresh: refreshFocusedInput }}>{Platform.OS === 'ios' ? <KeyboardAvoidingView style={s.backdrop} behavior="padding">{content}</KeyboardAvoidingView> : <View style={s.backdrop}>{content}</View>}</SheetInputFocusContext.Provider></Modal>;
}

function AppointmentCard({ appointment, linkedCount, onPress }: { appointment: Appointment; linkedCount: number; onPress: () => void }) {
  const { s } = useAppTheme();
  const date = new Date(appointment.startsAt); const total = appointment.agenda.length + linkedCount;
  const timeLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(date);
  return <Pressable style={s.appointmentCard} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${appointment.title}, ${fullDate.format(date)}, ${appointment.notificationId ? `reminder ${reminderLabel(appointment.reminderMinutes)} before` : 'reminder off'}, ${total} ${total === 1 ? 'item' : 'items'}`} accessibilityHint="Opens appointment details"><View style={s.dateBlock} importantForAccessibility="no-hide-descendants"><Text style={s.dateMonth} allowFontScaling={false}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</Text><Text style={s.dateDay} allowFontScaling={false}>{date.getDate()}</Text></View><View style={s.flex}><Text style={s.cardTitle}>{appointment.title}</Text><Text style={s.small}>{timeLabel}</Text><Text style={s.reminderLine}>{appointment.notificationId ? '◷ Reminder set' : '◷ Reminder off'} · {total} items</Text></View><Text style={s.chevron} allowFontScaling={false}>›</Text></Pressable>;
}

function ThoughtRow({ thought, color, onPress, onExplore, detail }: { thought: Thought; color: string; onPress: () => void; onExplore?: () => void; detail?: string }) {
  const { s } = useAppTheme();
  return <View style={s.thread}>
    <Pressable style={s.threadMain} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Edit thought: ${thought.text}. ${detail ?? (thought.tags.join(', ') || 'Unsorted')}`}>
      <View style={[s.threadDot, { backgroundColor: color }]} importantForAccessibility="no" /><View style={s.flex}><Text style={s.threadText}>{thought.text}</Text><Text style={s.tags}>{detail ?? (thought.tags.join(' · ') || 'Unsorted')}</Text></View>
      {!onExplore && <Text style={s.threadChevron} allowFontScaling={false}>›</Text>}
    </Pressable>
    {onExplore && <Pressable style={s.threadExplore} onPress={onExplore} accessibilityRole="button" accessibilityLabel={`Explore connections for: ${thought.text}`}><Text style={s.threadExploreText}>Connections</Text></Pressable>}
  </View>;
}
function Section({ eyebrow, title }: { eyebrow: string; title: string }) { const { s } = useAppTheme(); return <View style={s.section}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sectionTitle} accessibilityRole="header">{title}</Text></View>; }
function Empty({ title, body }: { title: string; body: string }) { const { s } = useAppTheme(); return <View style={s.empty}><Text style={s.cardTitle} accessibilityRole="header">{title}</Text><Text style={s.small}>{body}</Text></View>; }
function Field({ children, nativeID, heading = false }: { children: ReactNode; nativeID?: string; heading?: boolean }) { const { s } = useAppTheme(); return <Text style={s.field} nativeID={nativeID} accessibilityRole={heading ? "header" : undefined}>{children}</Text>; }
type ChipSelectionMode = 'none' | 'toggle' | 'radio';
function Chip({ label, selected, selectionMode = 'toggle', accessibilityLabel, onPress }: { label: string; selected: boolean; selectionMode?: ChipSelectionMode; accessibilityLabel?: string; onPress: () => void }) {
  const { s } = useAppTheme();
  const accessibilityState = selectionMode === 'radio' ? { checked: selected } : selectionMode === 'toggle' ? { selected } : undefined;
  return <Pressable style={[s.chip, selected && s.chipSelected]} onPress={onPress} accessibilityRole={selectionMode === 'radio' ? "radio" : "button"} accessibilityState={accessibilityState} accessibilityLabel={accessibilityLabel ?? label}><Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text></Pressable>;
}
function CreationButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) { const { s } = useAppTheme(); return <Pressable style={s.creationButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}><Text style={s.creationButtonText}>{label}</Text></Pressable>; }
function Primary({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { const { s } = useAppTheme(); return <Pressable style={[s.primary, disabled && s.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}><Text style={s.primaryText}>{label}</Text></Pressable>; }
function CalendarNavIcon({ active }: { active: boolean }) {
  const { C, s } = useAppTheme();
  const color = active ? C.accentText : C.muted;
  return <View style={s.calendarNavIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
    {icon === 'calendar' ? <CalendarNavIcon active={active} /> : <Text style={[s.navSymbol, active && s.navActive]} allowFontScaling={false}>{symbol}</Text>}
    <Text style={[s.navLabel, active && s.navActive]}>{label}</Text>
  </Pressable>;
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  app: { flex: 1, backgroundColor: C.paper }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.paper }, loadingText: { color: C.muted }, flex: { flex: 1 },
  locked: { flex: 1, backgroundColor: C.paper, paddingHorizontal: 24 }, lockBrand: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 10 }, lockContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 70 }, lockSymbol: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.sagePale, color: C.accentText, fontSize: 22, lineHeight: 58, fontWeight: '900', textAlign: 'center', overflow: 'hidden' }, lockTitle: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 27, lineHeight: 34, fontWeight: '600', textAlign: 'center', marginTop: 20 }, lockCopy: { maxWidth: 340, color: C.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10 }, unlockButton: { minWidth: 220, minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, marginTop: 24, paddingHorizontal: 22 }, lockHint: { maxWidth: 330, color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  topbar: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }, brand: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 }, brandText: { color: C.ink, fontWeight: '700', fontSize: 16 },
  brandMark: { width: 30, height: 28 }, dotOne: { position: 'absolute', width: 18, height: 18, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, top: 0 }, dotTwo: { position: 'absolute', width: 17, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, right: 0, top: 4 }, dotThree: { position: 'absolute', width: 18, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.accentText, left: 7, bottom: 0, backgroundColor: C.paper }, settings: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, settingsIcon: { color: C.accentText, fontSize: 20 },
  content: { flex: 1 }, body: { padding: 22, paddingBottom: 112 }, detailBody: { padding: 20, paddingBottom: 42 }, eyebrow: { color: C.accentText, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 6 }, title: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1 }, subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 4, marginBottom: 18 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  capture: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 23, backgroundColor: C.accentSolid, marginTop: 22, marginBottom: 8 }, plus: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.sagePale, alignItems: 'center', justifyContent: 'center' }, plusText: { color: C.accentText, fontSize: 28 }, captureTitle: { color: C.white, fontWeight: '700', fontSize: 17 }, captureSub: { color: '#FFFFFFD1', marginTop: 3, fontSize: 13 }, arrow: { color: C.white, fontSize: 30 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: C.yellow, borderRadius: 17, marginTop: 10 }, smallPrimary: { minHeight: 48, justifyContent: 'center', backgroundColor: C.accentSolid, paddingHorizontal: 13, borderRadius: 11 }, smallPrimaryText: { color: C.white, fontWeight: '700', fontSize: 12 }, section: { marginTop: 30, marginBottom: 12 }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 12 }, sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '700' }, creationButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: C.accentSolid }, creationButtonText: { color: C.white, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  taskHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 10 }, progressTrack: { height: 8, overflow: 'hidden', borderRadius: 4, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, progressFill: { height: '100%', borderRadius: 3, backgroundColor: C.accentSolid }, swipeHint: { color: C.muted, fontSize: 10, textAlign: 'center', marginVertical: 9 }, taskList: { gap: 8 },
  swipeShell: { overflow: 'hidden', borderRadius: 16, backgroundColor: C.accentSolid }, swipeUnder: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, completeReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, tomorrowReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, lockedReveal: { color: C.sagePale }, taskRow: { minHeight: 72, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: C.line }, taskMainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, taskCheckTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, taskCheck: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: C.accentText, backgroundColor: C.card }, taskProgressBadge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1.5, borderColor: C.accentText, backgroundColor: C.card }, taskProgressBadgeText: { color: C.accentText, fontSize: 9, fontWeight: '900' }, taskCheckDone: { borderColor: C.accentText, backgroundColor: C.accentSolid }, taskCheckText: { color: C.white, fontWeight: '900' }, taskEditTarget: { minHeight: 48, justifyContent: 'center' }, taskText: { color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 }, taskDone: { color: C.muted, textDecorationLine: 'line-through' }, taskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 4 }, carryOverText: { color: C.ink, fontSize: 10, fontWeight: '700' }, dailyBadge: { color: C.ink, fontSize: 10, fontWeight: '800' }, movedText: { color: C.moved, fontSize: 10, fontWeight: '800' }, lockIcon: { color: C.ink, fontSize: 11 },
  taskStepsSection: { marginTop: 4, marginLeft: 56 }, taskStepSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 2, borderRadius: 10, overflow: 'hidden' }, taskStepSummaryPressed: { backgroundColor: C.sagePale }, taskStepProgressTrack: { width: 34, height: 6, overflow: 'hidden', borderRadius: 3, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, taskStepProgressFill: { height: '100%', borderRadius: 2, backgroundColor: C.ink }, taskStepSummaryText: { flex: 1, color: C.ink, fontSize: 10, fontWeight: '700' }, taskStepDisclosure: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, taskStepsList: { gap: 5, paddingTop: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line }, taskStepRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 4 }, taskStepCheck: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 7, borderWidth: 1.3, borderColor: C.sage, backgroundColor: C.card }, taskStepCheckDone: { borderColor: C.accentText, backgroundColor: C.accentSolid }, taskStepCheckText: { color: C.white, fontSize: 11, fontWeight: '900' }, taskStepText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '600' }, taskStepTextDone: { color: C.ink, textDecorationLine: 'line-through' },
  tomorrowBox: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }, tomorrowTitle: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 9 }, tomorrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }, tomorrowEdit: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 4 }, stressDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#00000010' }, tomorrowText: { color: C.ink, fontSize: 13, fontWeight: '600' }, restoreButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: C.sagePale }, restoreText: { color: C.accentText, fontSize: 10, fontWeight: '800' }, scheduledAheadBox: { borderColor: `${C.line}99` }, scheduledTaskRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, scheduledDate: { minWidth: 78, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: C.line }, scheduledDateText: { color: C.muted, fontSize: 10, fontWeight: '800', textAlign: 'center' }, scheduledTaskText: { color: C.muted, fontSize: 13, fontWeight: '600' }, scheduledTaskMeta: { color: C.muted, fontSize: 10, fontWeight: '700' }, scheduledChevron: { color: C.muted, fontSize: 23, opacity: .65 },
  appointmentCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, dateBlock: { width: 64, height: 68, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sagePale }, dateMonth: { color: C.accentText, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, dateDay: { color: C.accentText, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 29, fontWeight: '600' }, cardTitle: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 3 }, small: { color: C.muted, fontSize: 12, lineHeight: 17 }, reminderLine: { color: C.accentText, fontSize: 11, fontWeight: '600', marginTop: 7 }, chevron: { color: C.muted, fontSize: 28 },
  empty: { padding: 22, alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.card }, thread: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 9, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 9 }, threadMain: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 3 }, threadDot: { width: 10, height: 10, borderRadius: 5 }, threadText: { color: C.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 }, threadChevron: { color: C.muted, fontSize: 23 }, threadExplore: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 11, backgroundColor: C.sagePale }, threadExploreText: { color: C.accentText, fontSize: 10, fontWeight: '800' }, tags: { color: C.muted, fontSize: 11, marginTop: 3 },
  thoughtCreate: { alignSelf: 'flex-start', marginBottom: 12 }, searchField: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14 }, searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 10, color: C.ink, fontSize: 15 }, searchHint: { color: C.muted, fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 7 }, thoughtListHeading: { marginTop: 22, marginBottom: 10 }, thoughtList: { marginTop: 10 }, connectionToggle: { flex: 0, marginTop: 4 }, cloudCard: { padding: 14, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, marginTop: 15, overflow: 'hidden' }, cloudEmpty: { marginTop: 14 }, connectionFocus: { color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 2 }, textButton: { minHeight: 48, justifyContent: 'center' }, link: { color: C.accentText, fontSize: 12, fontWeight: '700', padding: 8 }, mindMap: { height: MIND_MAP_HEIGHT, position: 'relative', marginTop: 6 }, largeTextMapFallback: { gap: 12, paddingVertical: 18 }, largeTextMapButton: { flex: 0 }, connectionLine: { position: 'absolute', height: 2, borderRadius: 2, backgroundColor: C.sage }, focusBubble: { position: 'absolute', width: FOCUS_BUBBLE_SIZE, height: FOCUS_BUBBLE_SIZE, borderRadius: FOCUS_BUBBLE_SIZE / 2, padding: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, borderWidth: 4, borderColor: C.sagePale, elevation: 4 }, focusLabel: { color: C.white, fontSize: 8, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }, focusBubbleText: { color: C.white, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' }, relationBubble: { position: 'absolute', width: RELATION_BUBBLE_SIZE, height: RELATION_BUBBLE_SIZE, borderRadius: RELATION_BUBBLE_SIZE / 2, padding: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.card, elevation: 2 }, relationBubbleText: { color: C.ink, fontSize: 9, lineHeight: 12, fontWeight: '800', textAlign: 'center' }, relationBubbleReason: { color: C.accentText, fontSize: 7, lineHeight: 9, fontWeight: '900', textAlign: 'center', marginTop: 3 }, noConnections: { position: 'absolute', left: 44, right: 44, bottom: 50, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 13, backgroundColor: C.paper, borderWidth: 1, borderColor: C.line }, noConnectionsText: { color: C.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' }, mapHint: { position: 'absolute', left: 0, right: 0, bottom: 1, color: C.muted, fontSize: 8, fontWeight: '700', textAlign: 'center' },
  scheduleAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: C.accentSolid, paddingHorizontal: 18 }, scheduleActionText: { color: C.white, fontSize: 14, fontWeight: '800' }, calendarList: { gap: 22, marginTop: 26 }, calendarDay: { gap: 10 }, calendarDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, calendarDayDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.sage }, calendarDayLabel: { color: C.accentText, fontSize: 12, fontWeight: '800' }, calendarDayCards: { gap: 10, paddingLeft: 13, borderLeftWidth: 1, borderLeftColor: C.line }, nav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: Platform.OS === 'ios' ? 12 : 4 }, navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navSymbol: { color: C.muted, fontSize: 23 }, navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' }, navActive: { color: C.accentText, fontWeight: '800' }, calendarNavIcon: { width: 26, height: 24, transform: [{ rotate: '-2deg' }] }, calendarNavPage: { position: 'absolute', left: 2, top: 4, width: 22, height: 19, overflow: 'hidden', borderWidth: 1.7, borderRadius: 6, backgroundColor: C.card }, calendarNavPageActive: { backgroundColor: C.sagePale }, calendarNavRing: { position: 'absolute', top: 1, width: 2.5, height: 8, borderRadius: 2 }, calendarNavRingLeft: { left: 7 }, calendarNavRingRight: { right: 7 }, calendarNavDivider: { position: 'absolute', left: 0, right: 0, top: 5, height: 1.5, opacity: .72 }, calendarNavDateLarge: { position: 'absolute', left: 5, top: 10, width: 6, height: 4, borderRadius: 3 }, calendarNavDateSmall: { position: 'absolute', left: 13, top: 10, width: 3.5, height: 4, borderRadius: 2, opacity: .55 },
  backButton: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: 16 }, back: { color: C.accentText, fontWeight: '700', fontSize: 14 }, hero: { backgroundColor: C.accentSolid, borderRadius: 23, padding: 22 }, heroEyebrow: { color: C.white, textTransform: 'uppercase', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroTitle: { color: C.white, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 31, fontWeight: '600', marginTop: 6, marginBottom: 15 }, heroFact: { color: '#FFFFFFD1', fontSize: 14, marginBottom: 7 }, reminderPill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: C.sagePale }, reminderPillText: { color: C.accentText, fontSize: 11, fontWeight: '700' },
  planIntro: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: -4, marginBottom: 13 }, agenda: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 8 }, agendaContent: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 2 }, checkboxTarget: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.sage, alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: C.accentSolid, borderColor: C.accentText }, check: { color: C.white, fontWeight: '800' }, agendaText: { color: C.ink, fontSize: 14, lineHeight: 20 }, editHint: { color: C.muted, fontSize: 10, marginTop: 3 }, done: { color: C.muted, textDecorationLine: 'line-through' }, planAddButton: { flex: 0, marginTop: 5 }, linked: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.peach, marginBottom: 8 }, detailActions: { flexDirection: 'row', gap: 9, marginTop: 28 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14 }, secondaryText: { color: C.accentText, fontWeight: '700', fontSize: 13 }, dangerButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.dangerLine, backgroundColor: C.card }, dangerText: { color: C.danger, fontWeight: '700' }, modalDanger: { flex: 0, marginTop: 10 }, modalCopy: { color: C.muted, fontSize: 13, lineHeight: 19 }, confirmPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginBottom: 14 }, confirmDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#00000012' }, confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, confirmPrimary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, paddingHorizontal: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#25322F73' }, sheet: { maxHeight: '90%', paddingTop: 8, paddingHorizontal: 22, paddingBottom: Platform.OS === 'ios' ? 24 : 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.paper }, sheetExpanded: { height: '92%', maxHeight: '92%' }, handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.handle, marginBottom: 15 }, sheetTitle: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 25, fontWeight: '600' }, close: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, closeText: { color: C.muted, fontSize: 25 }, sheetScroll: { flexShrink: 1 }, sheetScrollExpanded: { flex: 1 }, sheetBody: { paddingTop: 20, paddingBottom: 10 }, field: { color: C.ink, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 14 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.ink, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 }, textarea: { minHeight: 105, paddingTop: 13, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 4 }, reminderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 }, suggestionChips: { flexDirection: 'row', gap: 8, paddingTop: 9, paddingBottom: 2 }, showAllLink: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' }, chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, chipSelected: { backgroundColor: C.accentSolid, borderColor: C.accentText }, chipText: { color: C.muted, fontSize: 12, fontWeight: '600' }, chipTextSelected: { color: C.white }, inputHint: { color: C.muted, fontSize: 10, lineHeight: 14, marginTop: 6 }, primary: { minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSolid, marginTop: 22, paddingHorizontal: 14, paddingVertical: 10 }, primaryText: { color: C.white, fontSize: 14, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: .45 }, thoughtToGoal: { flex: 0, marginTop: 10, backgroundColor: C.sagePale }, thoughtToGoalHint: { color: C.muted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 6, marginBottom: 2 }, sourceThoughtCard: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.sagePale, marginTop: 10 }, sourceThoughtLabel: { color: C.accentText, fontSize: 9, fontWeight: '900', letterSpacing: .8, textTransform: 'uppercase', marginBottom: 2 }, sourceThoughtText: { color: C.ink, fontSize: 12, lineHeight: 17, fontWeight: '600' }, taskTypeChoices: { gap: 8 }, taskType: { minHeight: 48, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, taskTypeSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, taskTypeTitle: { color: C.ink, fontSize: 14, fontWeight: '800', marginBottom: 2 }, taskPlanChoices: { flexDirection: 'row', gap: 8, marginTop: 9 }, taskPlanChoice: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, taskPlanChoiceSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, taskPlanChoiceText: { color: C.muted, fontSize: 11, fontWeight: '800', textAlign: 'center' }, taskPlanChoiceTextSelected: { color: C.accentText }, taskPlanChoiceDate: { color: C.muted, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 3 }, dailyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: C.yellow, marginTop: 10 }, dailyNoteIcon: { color: C.accentText, fontSize: 12 }, dateRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, dateButton: { flex: 1, minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 13 }, taskDateButton: { flex: 0, marginTop: 9 }, dateLabel: { color: C.accentText, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, dateValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }, pickerWrap: { marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: C.card }, pickerDoneButton: { minHeight: 48, justifyContent: 'center', alignItems: 'flex-end' }, pickerDone: { color: C.accentText, fontWeight: '800', textAlign: 'right', paddingHorizontal: 12 },
  makeSmallerButton: { flex: 0, marginTop: 12, backgroundColor: C.sagePale }, makeSmallerHint: { color: C.muted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 6 }, stepEditor: { gap: 8, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.sagePale, marginTop: 12 }, stepEditorTitle: { color: C.ink, fontSize: 14, fontWeight: '800' }, stepEditorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, stepNumber: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: C.accentSolid }, stepNumberText: { color: C.white, fontSize: 10, fontWeight: '900' }, stepEditorInput: { flex: 1, minHeight: 48, paddingHorizontal: 11, fontSize: 13 }, removeStepButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.card }, removeStepText: { color: C.danger, fontSize: 22, lineHeight: 24 }, addStepButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderStyle: 'dashed', borderColor: C.sage, backgroundColor: C.card, marginTop: 2 }, addStepText: { color: C.accentText, fontSize: 12, fontWeight: '800' },
  themeChoices: { flexDirection: 'row', gap: 8 }, themeChoice: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, themeChoiceSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, themeChoiceText: { color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' }, themeChoiceTextSelected: { color: C.accentText, fontWeight: '900' },
  reminderStatus: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.muted, marginTop: 4 }, statusDotOn: { backgroundColor: C.sage }, securitySetting: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, switchControl: { minWidth: 48, minHeight: 48 }, dailyStatusTimeSetting: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginTop: 10 }, dailyStatusTimeButton: { minWidth: 82, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.sagePale }, dailyStatusTimeText: { color: C.accentText, fontSize: 14, fontWeight: '900' }, lockDelaySetting: { padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginTop: 10 }, lockDelayChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 }, lockDelayChoice: { width: '48%', minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper }, lockDelayChoiceSelected: { borderColor: C.accentText, backgroundColor: C.sagePale }, lockDelayChoiceText: { color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' }, lockDelayChoiceTextSelected: { color: C.accentText, fontWeight: '900' }, spacedButton: { marginTop: 12 }, wideSecondary: { flex: 0 }, linkThoughtButton: { marginTop: 10 }, privacy: { color: C.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 15 }, privacySummary: { padding: 16, borderRadius: 16, backgroundColor: C.sagePale, borderWidth: 1, borderColor: C.line }, policyText: { color: C.muted, fontSize: 13, lineHeight: 20 }, disclaimer: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 20, padding: 14, borderRadius: 13, backgroundColor: C.yellow }, toast: { position: 'absolute', left: 24, right: 24, bottom: 94, minHeight: 48, paddingVertical: 9, paddingLeft: 14, paddingRight: 8, borderRadius: 13, backgroundColor: C.toastBackground, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20 }, toastText: { flex: 1, color: C.toastText, fontSize: 13, fontWeight: '600' }, toastAction: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: '#FFFFFF20' }, toastActionText: { color: C.white, fontSize: 12, fontWeight: '900' },
}); }
