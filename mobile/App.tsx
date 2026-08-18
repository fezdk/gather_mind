import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Animated, Keyboard, KeyboardAvoidingView, Linking, Modal, PanResponder,
  Platform, Pressable, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AgendaItem, Appointment, AppState, DailyTask, REMINDER_OPTIONS, Thought, dateKeyAfter,
  createEmptyState, describeCountdown, groupUpcomingAppointments, localDateKey, makeId, reminderLabel, reminderTime, removeLegacySeedData, searchThoughts,
  tasksForToday, tasksForTomorrow, upcomingAppointments,
} from './src/model';
import { clearState as clearStoredState, loadState, saveState } from './src/storage';
import {
  cancelReminder, configureNotifications, notificationsEnabled, reconcileReminders,
  requestNotificationPermission, scheduleReminder,
} from './src/notifications';

type Tab = 'today' | 'cloud' | 'appointments';
type PickerMode = 'date' | 'time' | null;

const C = {
  ink: '#25322F', muted: '#6D7873', paper: '#F7F3EA', card: '#FFFDF8', sage: '#779887',
  sageDark: '#416555', sagePale: '#DFE9DF', peach: '#F7E1D3', yellow: '#EFE2AC',
  lavender: '#DED8EB', blue: '#D8E9E9', line: '#DEDFD7', danger: '#9E5148', white: '#FFFFFF',
};
const bubbles = [C.sagePale, C.peach, C.yellow, C.lavender, C.blue];
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><GatherMindApp /></SafeAreaProvider>;
}

function GatherMindApp() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' ? Math.max(insets.top, NativeStatusBar.currentHeight ?? 0) : insets.top;
  const [state, setState] = useState<AppState | null>(null);
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
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    async function initialise() {
      await configureNotifications();
      const stored = await loadState();
      const legacyReminderIds = stored.appointments.filter((appointment) => appointment.id === 'appointment_demo_doctor').map((appointment) => appointment.notificationId);
      await Promise.all(legacyReminderIds.map(cancelReminder));
      const cleaned = removeLegacySeedData(stored);
      const appointments = await reconcileReminders(cleaned.appointments);
      const hydrated = appointments === cleaned.appointments ? cleaned : { ...cleaned, appointments };
      if (hydrated !== stored) await saveState(hydrated);
      if (mounted) {
        setState(hydrated);
        setNotificationsOn(await notificationsEnabled());
      }
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const appointmentId = lastResponse?.notification.request.content.data?.appointmentId;
      if (mounted && typeof appointmentId === 'string') {
        setSelectedId(appointmentId);
        setTab('appointments');
        Notifications.clearLastNotificationResponse();
      }
    }
    initialise().catch((error) => Alert.alert('Could not start Gather Mind', String(error)));
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const appointmentId = response.notification.request.content.data?.appointmentId;
      if (typeof appointmentId === 'string') {
        setSelectedId(appointmentId);
        setTab('appointments');
      }
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  function commit(next: AppState) {
    setState(next);
    saveState(next).catch((error) => Alert.alert('Could not save', String(error)));
  }

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(''), 2600);
  }

  async function enableReminders() {
    const allowed = await requestNotificationPermission();
    setNotificationsOn(allowed);
    if (!allowed) {
      Alert.alert('Reminders are off', 'Notifications were not allowed. You can enable them later in your phone settings.');
      return false;
    }
    if (state) {
      const appointments = await reconcileReminders(state.appointments);
      if (appointments !== state.appointments) commit({ ...state, appointments });
    }
    flash('Appointment reminders are on');
    return true;
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
      else appointment = { ...appointment, reminderMinutes: 0, notificationId: null };
    } else {
      await cancelReminder(appointment.notificationId);
      appointment = { ...appointment, notificationId: null };
    }
    const appointments = existing
      ? state.appointments.map((item) => item.id === appointment.id ? appointment : item)
      : [...state.appointments, appointment];
    commit({ ...state, appointments });
    setAppointmentModal(false);
    setSelectedId(appointment.id);
    setTab('appointments');
    flash(existing ? 'Appointment and reminder updated' : 'Appointment and reminder saved');
  }

  async function deleteAppointment(appointment: Appointment) {
    if (!state) return;
    await cancelReminder(appointment.notificationId);
    commit({
      ...state,
      appointments: state.appointments.filter((item) => item.id !== appointment.id),
      thoughts: state.thoughts.map((thought) => thought.appointmentId === appointment.id ? { ...thought, appointmentId: '' } : thought),
    });
    setSelectedId(null);
    flash('Appointment and reminder deleted');
  }

  function openThought(thought?: Thought) {
    setEditingThoughtId(thought?.id ?? null);
    setThoughtModal(true);
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
    setThoughtModal(false);
    setEditingThoughtId(null);
    flash(existing ? 'Thought updated' : 'Thought safely caught');
  }

  function deleteThought(thought: Thought) {
    if (!state) return;
    Alert.alert('Remove this thought?', 'This thought will be removed from the cloud and any linked appointment.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        commit({ ...state, thoughts: state.thoughts.filter((item) => item.id !== thought.id) });
        setThoughtModal(false);
        setEditingThoughtId(null);
        flash('Thought removed');
      } },
    ]);
  }

  function openTask(task?: DailyTask) {
    setEditingTaskId(task?.id ?? null);
    setTaskModal(true);
  }

  function saveTask(title: string, isDaily: boolean, existing?: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    const task: DailyTask = existing
      ? {
          ...existing,
          title,
          isDaily,
          scheduledFor: existing.isDaily && !isDaily ? today : existing.scheduledFor,
          completedOn: existing.isDaily && !isDaily && existing.completedOn !== today ? null : existing.completedOn,
        }
      : {
          id: makeId('task'), title, isDaily, scheduledFor: localDateKey(), completedOn: null,
          offsetCount: 0, createdAt: new Date().toISOString(),
        };
    const tasks = existing
      ? state.tasks.map((item) => item.id === task.id ? task : item)
      : [...state.tasks, task];
    commit({ ...state, tasks });
    setTaskModal(false);
    setEditingTaskId(null);
    flash(existing ? 'Goal updated' : isDaily ? 'Daily essential added' : 'Today’s goal added');
  }

  function toggleTask(task: DailyTask) {
    if (!state) return;
    const today = localDateKey();
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, completedOn: item.completedOn === today ? null : today } : item) });
  }

  function postponeTask(task: DailyTask) {
    if (!state) return;
    if (task.isDaily) {
      Alert.alert('This stays on today’s list', 'Daily essentials cannot be moved to tomorrow. You can still check it off when it is done.');
      return;
    }
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, scheduledFor: dateKeyAfter(localDateKey(), 1), completedOn: null, offsetCount: item.offsetCount + 1 } : item) });
    setPendingPostponeId(null);
    flash('Moved to tomorrow');
  }

  function requestPostponeTask(task: DailyTask) {
    if (task.isDaily) {
      Alert.alert('This stays on today’s list', 'Daily essentials cannot be moved to tomorrow. You can still check it off when it is done.');
      return;
    }
    setPendingPostponeId(task.id);
  }

  function restoreTask(task: DailyTask) {
    if (!state) return;
    commit({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, scheduledFor: localDateKey(), offsetCount: Math.max(0, item.offsetCount - 1) } : item) });
    flash('Brought back to today');
  }

  function deleteTask(task: DailyTask) {
    if (!state) return;
    Alert.alert('Remove this goal?', task.isDaily ? 'This will remove it from every daily list.' : 'This goal will be removed.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        commit({ ...state, tasks: state.tasks.filter((item) => item.id !== task.id) });
        setTaskModal(false);
        setEditingTaskId(null);
        flash('Goal removed');
      } },
    ]);
  }

  async function deleteAllData() {
    let reminderCleanupFailed = false;
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync();
    } catch (error) {
      reminderCleanupFailed = true;
      console.warn('Could not remove every notification during data deletion', error);
    }
    try {
      await clearStoredState();
      setState(createEmptyState());
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
        Alert.alert('Local data deleted', 'Your Gather Mind content was erased, but Android may still hold a previously scheduled reminder. Restart the phone or remove Gather Mind’s alarms in Android settings if one appears.');
      } else {
        flash('All local data and scheduled reminders were deleted');
      }
    } catch (error) {
      Alert.alert('Could not delete local data', `Gather Mind could not complete the deletion. ${String(error)}`);
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

  if (!state) return <SafeAreaView style={[s.loading, { paddingTop: topInset }]} edges={['right', 'bottom', 'left']}><ActivityIndicator color={C.sageDark} /><Text style={s.loadingText}>Gathering your thoughts…</Text></SafeAreaView>;
  const selected = state.appointments.find((item) => item.id === selectedId);
  const editingThought = state.thoughts.find((item) => item.id === editingThoughtId);
  const editingTask = state.tasks.find((item) => item.id === editingTaskId);
  const pendingTask = state.tasks.find((item) => item.id === pendingPostponeId);

  return <SafeAreaView style={[s.app, { paddingTop: topInset }]} edges={['right', 'left']}>
    <ExpoStatusBar style="dark" backgroundColor={C.paper} translucent />
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
      onBack={() => setSelectedId(null)}
      onChange={(appointment) => commit({ ...state, appointments: state.appointments.map((item) => item.id === appointment.id ? appointment : item) })}
      onAddThought={() => openThought()}
      onEditThought={openThought}
      onEdit={() => setAppointmentModal(true)}
      onDelete={() => Alert.alert('Delete this appointment?', 'Its reminder will also be cancelled. Linked thoughts will be kept.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteAppointment(selected) },
      ])}
    /> : <>
      {tab === 'today' && <TodayView state={state} notificationsOn={notificationsOn} onEnable={enableReminders} onCapture={() => openThought()} onEditThought={openThought} onAddTask={() => openTask()} onEditTask={openTask} onToggleTask={toggleTask} onPostponeTask={requestPostponeTask} onRestoreTask={restoreTask} onAddAppointment={() => setAppointmentModal(true)} onOpen={(id) => { setSelectedId(id); setTab('appointments'); }} />}
      {tab === 'cloud' && <CloudView thoughts={state.thoughts} onCapture={() => openThought()} onEdit={openThought} />}
      {tab === 'appointments' && <AppointmentsView appointments={state.appointments} onAdd={() => setAppointmentModal(true)} onOpen={setSelectedId} />}
      <View style={[s.nav, { height: 78 + insets.bottom, paddingBottom: Math.max(4, insets.bottom) }]}>
        <NavButton label="Today" symbol="⌂" active={tab === 'today'} onPress={() => setTab('today')} />
        <NavButton label="Cloud" symbol="⌘" active={tab === 'cloud'} onPress={() => setTab('cloud')} />
        <NavButton label="Appointments" symbol="□" active={tab === 'appointments'} onPress={() => setTab('appointments')} />
      </View>
    </>}

    <ThoughtModal visible={thoughtModal} thought={editingThought} appointments={upcomingAppointments(state.appointments)} onClose={() => { setThoughtModal(false); setEditingThoughtId(null); }} onSave={saveThought} onDelete={deleteThought} preselectedId={selectedId ?? ''} />
    <TaskModal visible={taskModal} task={editingTask} onClose={() => { setTaskModal(false); setEditingTaskId(null); }} onSave={saveTask} onDelete={deleteTask} />
    <AppointmentModal visible={appointmentModal} appointment={selected} onClose={() => setAppointmentModal(false)} onSave={upsertAppointment} />
    <SettingsModal visible={reminderModal} enabled={notificationsOn} onClose={() => setReminderModal(false)} onEnable={enableReminders} onPrivacy={() => { setReminderModal(false); setPrivacyModal(true); }} onDeleteAll={confirmDeleteAllData} />
    <PrivacyModal visible={privacyModal} onClose={() => setPrivacyModal(false)} onDeleteAll={confirmDeleteAllData} />
    <PostponeModal visible={!!pendingTask} task={pendingTask} onClose={() => setPendingPostponeId(null)} onConfirm={() => pendingTask && postponeTask(pendingTask)} />
    {!!message && <View style={[s.toast, { bottom: 94 + insets.bottom }]}><Text style={s.toastText}>{message}</Text></View>}
  </SafeAreaView>;
}

function TodayView({ state, notificationsOn, onEnable, onCapture, onEditThought, onAddTask, onEditTask, onToggleTask, onPostponeTask, onRestoreTask, onAddAppointment, onOpen }: { state: AppState; notificationsOn: boolean; onEnable: () => void; onCapture: () => void; onEditThought: (thought: Thought) => void; onAddTask: () => void; onEditTask: (task: DailyTask) => void; onToggleTask: (task: DailyTask) => void; onPostponeTask: (task: DailyTask) => void; onRestoreTask: (task: DailyTask) => void; onAddAppointment: () => void; onOpen: (id: string) => void }) {
  const { bottom } = useSafeAreaInsets();
  const next = upcomingAppointments(state.appointments)[0];
  const today = localDateKey();
  const todayTasks = tasksForToday(state.tasks, today);
  const tomorrowTasks = tasksForTomorrow(state.tasks, today);
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
    {!!tomorrowTasks.length && <View style={s.tomorrowBox}><Text style={s.tomorrowTitle}>Waiting for tomorrow</Text>{tomorrowTasks.map((task) => <View style={s.tomorrowRow} key={`tomorrow-${task.id}`}><View style={[s.stressDot, { backgroundColor: taskColor(task.offsetCount) }]} /><Pressable style={s.tomorrowEdit} onPress={() => onEditTask(task)}><Text style={s.tomorrowText}>{task.title}</Text>{task.offsetCount > 0 && <Text style={s.movedText}>Moved {task.offsetCount}×</Text>}</Pressable><Pressable style={s.restoreButton} onPress={() => onRestoreTask(task)} accessibilityLabel={`Bring ${task.title} back to today`}><Text style={s.restoreText}>↶ Today</Text></Pressable></View>)}</View>}
    <View style={s.sectionAction}><View style={s.flex}><Text style={s.eyebrow}>Coming up</Text><Text style={s.sectionTitle}>Your next appointment</Text></View><Pressable style={s.scheduleSmall} onPress={onAddAppointment} accessibilityRole="button"><Text style={s.scheduleSmallText}>+ Schedule</Text></Pressable></View>
    {next ? <AppointmentCard appointment={next} linkedCount={state.thoughts.filter((thought) => thought.appointmentId === next.id).length} onPress={() => onOpen(next.id)} /> : <Empty title="Nothing scheduled" body="Add an appointment when you’re ready." />}
    <Section eyebrow="Still open" title="Loose threads" />
    {state.thoughts.slice(0, 4).map((thought, index) => <ThoughtRow key={thought.id} thought={thought} color={bubbles[index % bubbles.length]} onPress={() => onEditThought(thought)} />)}
  </ScrollView>;
}

function taskColor(offsetCount: number) {
  if (offsetCount >= 4) return '#C77668';
  if (offsetCount === 3) return '#E3A091';
  if (offsetCount === 2) return '#F0BEA6';
  if (offsetCount === 1) return '#F1DB9B';
  return C.card;
}

function SwipeTaskRow({ task, today, onEdit, onToggle, onPostpone }: { task: DailyTask; today: string; onEdit: () => void; onToggle: () => void; onPostpone: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isDone = task.completedOn === today;
  const cannotPostpone = task.isDaily || isDone;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 9 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_event, gesture) => {
      const movement = cannotPostpone && gesture.dx < 0 ? gesture.dx * .16 : gesture.dx;
      translateX.setValue(Math.max(-125, Math.min(125, movement)));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 72) {
        Animated.timing(translateX, { toValue: 125, duration: 120, useNativeDriver: true }).start(() => { translateX.setValue(0); onToggle(); });
      } else if (gesture.dx < -72 && !cannotPostpone) {
        Animated.timing(translateX, { toValue: -125, duration: 120, useNativeDriver: true }).start(() => { translateX.setValue(0); onPostpone(); });
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 7 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
  }), [cannotPostpone, onPostpone, onToggle, translateX]);

  return <View style={s.swipeShell}>
    <View style={s.swipeUnder}><Text style={s.completeReveal}>{isDone ? '↶ Reopen' : '✓ Complete'}</Text><Text style={[s.tomorrowReveal, cannotPostpone && s.lockedReveal]}>{isDone ? 'Completed stays today' : task.isDaily ? 'Daily stays today' : 'Tomorrow →'}</Text></View>
    <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
      <View style={[s.taskRow, { backgroundColor: isDone ? C.sagePale : taskColor(task.offsetCount) }]}>
        <Pressable style={[s.taskCheck, isDone && s.taskCheckDone]} onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}><Text style={s.taskCheckText}>{isDone ? '✓' : ''}</Text></Pressable>
        <Pressable style={s.flex} onPress={onEdit} accessibilityRole="button" accessibilityHint="Opens the goal editor"><Text style={[s.taskText, isDone && s.taskDone]}>{task.title}</Text><View style={s.taskMeta}>{task.isDaily && <Text style={s.dailyBadge}>◇ Daily · stays today</Text>}{!task.isDaily && task.offsetCount > 0 && <Text style={s.movedText}>Moved {task.offsetCount}×</Text>}</View></Pressable>
        {!task.isDaily && !isDone && <Pressable style={s.tomorrowButton} onPress={onPostpone} accessibilityLabel={`Move ${task.title} to tomorrow`}><Text style={s.tomorrowButtonText}>→</Text></Pressable>}
        {task.isDaily && <Text style={s.lockIcon} accessibilityLabel="Cannot be moved to tomorrow">◆</Text>}
      </View>
    </Animated.View>
  </View>;
}

function CloudView({ thoughts, onCapture, onEdit }: { thoughts: Thought[]; onCapture: () => void; onEdit: (thought: Thought) => void }) {
  const { bottom } = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchThoughts(thoughts, query).slice(0, 12), [thoughts, query]);
  return <ScrollView style={s.content} contentContainerStyle={[s.body, { paddingBottom: 112 + bottom }]} keyboardShouldPersistTaps="handled">
    <Text style={s.eyebrow}>See the connections</Text><Text style={s.title}>Mind cloud</Text><Text style={s.subtitle}>Search a phrase to gather related thoughts.</Text>
    <TextInput style={s.search} value={query} onChangeText={setQuery} placeholder="Try “meeting”, “sleep”, or “work”" placeholderTextColor={C.muted} accessibilityLabel="Search thoughts" />
    <View style={s.cloudCard}><View style={s.between}><Text style={s.small}>{matches.length} thoughts</Text><Pressable onPress={onCapture}><Text style={s.link}>+ Add thought</Text></Pressable></View><View style={s.cloud}>{matches.length ? matches.map((thought, index) => <Pressable key={thought.id} onPress={() => onEdit(thought)} accessibilityLabel={`Edit thought: ${thought.text}`} style={[s.bubble, index === 0 && s.bubbleLarge, { backgroundColor: bubbles[index % bubbles.length] }]}><Text style={s.bubbleText} numberOfLines={3}>{thought.text}</Text></Pressable>) : <Empty title="Nothing gathered here" body="Try another phrase." />}</View></View>
    <Section eyebrow="Easy to scan" title="Related list" />
    {matches.map((thought, index) => <ThoughtRow key={`list-${thought.id}`} thought={thought} color={bubbles[index % bubbles.length]} onPress={() => onEdit(thought)} />)}
  </ScrollView>;
}

function AppointmentsView({ appointments, onAdd, onOpen }: { appointments: Appointment[]; onAdd: () => void; onOpen: (id: string) => void }) {
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

function AppointmentDetail({ appointment, thoughts, onBack, onChange, onAddThought, onEditThought, onEdit, onDelete }: { appointment: Appointment; thoughts: Thought[]; onBack: () => void; onChange: (appointment: Appointment) => void; onAddThought: () => void; onEditThought: (thought: Thought) => void; onEdit: () => void; onDelete: () => void }) {
  const { bottom } = useSafeAreaInsets();
  const [planModal, setPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const editingPlanItem = appointment.agenda.find((item) => item.id === editingPlanId);
  function openPlanItem(item?: AgendaItem) { setEditingPlanId(item?.id ?? null); setPlanModal(true); }
  function closePlanItem() { setPlanModal(false); setEditingPlanId(null); }
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
    <Section eyebrow="From your cloud" title="Linked thoughts" />
    {thoughts.length ? thoughts.map((thought) => <Pressable key={thought.id} style={s.linked} onPress={() => onEditThought(thought)}><View style={s.flex}><Text style={s.threadText}>{thought.text}</Text><Text style={s.editHint}>Tap to edit</Text></View><Text style={s.threadChevron}>›</Text></Pressable>) : <Empty title="No linked thoughts" body="Link a thought when you capture it, or add one here." />}
    <Pressable style={[s.secondary, s.linkThoughtButton]} onPress={onAddThought}><Text style={s.secondaryText}>+ Add a linked thought</Text></Pressable>
    <View style={s.detailActions}><Pressable style={s.secondary} onPress={onEdit}><Text style={s.secondaryText}>Edit details</Text></Pressable><Pressable style={s.dangerButton} onPress={onDelete}><Text style={s.dangerText}>Delete</Text></Pressable></View>
  </ScrollView><AgendaItemModal visible={planModal} item={editingPlanItem} onClose={closePlanItem} onSave={savePlanItem} onDelete={deletePlanItem} /></>;
}

function AgendaItemModal({ visible, item, onClose, onSave, onDelete }: { visible: boolean; item?: AgendaItem; onClose: () => void; onSave: (text: string) => void; onDelete: (item: AgendaItem) => void }) {
  const [text, setText] = useState('');
  useEffect(() => { if (visible) setText(item?.text ?? ''); }, [visible, item]);
  return <Sheet visible={visible} onClose={onClose} eyebrow={item ? 'Edit plan item' : 'Appointment plan'} title={item ? 'Update this item' : 'What do you want to remember?'}>
    <Text style={s.modalCopy}>This can be a question, decision, document, thing to bring, errand, or follow-up.</Text>
    <Field>Plan item</Field><TextInput style={[s.input, s.textarea]} value={text} onChangeText={setText} placeholder="Write it in your own words" placeholderTextColor={C.muted} multiline autoFocus />
    <Primary label={item ? 'Save changes' : 'Add to appointment plan'} onPress={() => onSave(text.trim())} disabled={!text.trim()} />
    {item && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(item)}><Text style={s.dangerText}>Remove plan item</Text></Pressable>}
  </Sheet>;
}

function TaskModal({ visible, task, onClose, onSave, onDelete }: { visible: boolean; task?: DailyTask; onClose: () => void; onSave: (title: string, isDaily: boolean, existing?: DailyTask) => void; onDelete: (task: DailyTask) => void }) {
  const [title, setTitle] = useState('');
  const [isDaily, setIsDaily] = useState(false);
  useEffect(() => { if (visible) { setTitle(task?.title ?? ''); setIsDaily(task?.isDaily ?? false); } }, [visible, task]);
  return <Sheet visible={visible} onClose={onClose} eyebrow={task ? 'Edit goal' : 'One manageable thing'} title={task ? 'Adjust this goal' : 'Add to today'}>
    <Field>What would you like to do?</Field>
    <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="A small, clear goal" placeholderTextColor={C.muted} autoFocus onSubmitEditing={() => title.trim() && onSave(title.trim(), isDaily, task)} />
    <Field>How should it behave?</Field>
    <View style={s.taskTypeChoices}>
      <Pressable style={[s.taskType, !isDaily && s.taskTypeSelected]} onPress={() => setIsDaily(false)}><Text style={s.taskTypeTitle}>Just this time</Text><Text style={s.small}>Can be moved to tomorrow.</Text></Pressable>
      <Pressable style={[s.taskType, isDaily && s.taskTypeSelected]} onPress={() => setIsDaily(true)}><Text style={s.taskTypeTitle}>Daily essential</Text><Text style={s.small}>Returns each day and cannot be moved.</Text></Pressable>
    </View>
    {isDaily && <View style={s.dailyNote}><Text style={s.dailyNoteIcon}>◆</Text><Text style={[s.small, s.flex]}>Good for medication and other essentials that must stay visible today.</Text></View>}
    <Primary label={task ? 'Save changes' : 'Add to today'} onPress={() => onSave(title.trim(), isDaily, task)} disabled={!title.trim()} />
    {task && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(task)}><Text style={s.dangerText}>Remove goal</Text></Pressable>}
  </Sheet>;
}

function ThoughtModal({ visible, thought, appointments, onClose, onSave, onDelete, preselectedId }: { visible: boolean; thought?: Thought; appointments: Appointment[]; onClose: () => void; onSave: (input: Pick<Thought, 'text' | 'tags' | 'appointmentId'>, existing?: Thought) => void; onDelete: (thought: Thought) => void; preselectedId: string }) {
  const [text, setText] = useState(''); const [tags, setTags] = useState(''); const [appointmentId, setAppointmentId] = useState(preselectedId);
  useEffect(() => { if (visible) { setText(thought?.text ?? ''); setTags(thought?.tags.join(', ') ?? ''); setAppointmentId(thought?.appointmentId ?? preselectedId); } }, [visible, thought, preselectedId]);
  function submit() { if (!text.trim()) return; onSave({ text: text.trim(), tags: [...new Set(tags.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))], appointmentId }, thought); }
  return <Sheet visible={visible} onClose={onClose} eyebrow={thought ? 'Edit thought' : 'Quick capture'} title={thought ? 'Adjust what you caught' : 'What’s on your mind?'}>
    <Field>Thought</Field><TextInput style={[s.input, s.textarea]} value={text} onChangeText={setText} placeholder="It can be messy. Just get it out." placeholderTextColor={C.muted} multiline autoFocus />
    <Field>Themes (optional)</Field><TextInput style={s.input} value={tags} onChangeText={setTags} placeholder="health, sleep, work" placeholderTextColor={C.muted} />
    {!!appointments.length && <><Field>Link to an appointment (optional)</Field><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip label="Not linked" selected={!appointmentId} onPress={() => setAppointmentId('')} />{appointments.map((appointment) => <Chip key={appointment.id} label={appointment.title} selected={appointmentId === appointment.id} onPress={() => setAppointmentId(appointment.id)} />)}</ScrollView></>}
    <Primary label={thought ? 'Save changes' : 'Keep this thought'} onPress={submit} disabled={!text.trim()} />
    {thought && <Pressable style={[s.dangerButton, s.modalDanger]} onPress={() => onDelete(thought)}><Text style={s.dangerText}>Remove thought</Text></Pressable>}
  </Sheet>;
}

function PostponeModal({ visible, task, onClose, onConfirm }: { visible: boolean; task?: DailyTask; onClose: () => void; onConfirm: () => void }) {
  return <Sheet visible={visible} onClose={onClose} eyebrow="A deliberate move" title="Move to tomorrow?">
    <View style={s.confirmPreview}><View style={[s.confirmDot, { backgroundColor: taskColor((task?.offsetCount ?? 0) + 1) }]} /><View style={s.flex}><Text style={s.cardTitle}>{task?.title}</Text><Text style={s.small}>It will remain visible under “Waiting for tomorrow,” and you can bring it back.</Text></View></View>
    <Text style={s.modalCopy}>This will be move {(task?.offsetCount ?? 0) + 1}. Repeated moves gradually use a warmer color, without hiding or judging the goal.</Text>
    <View style={s.confirmActions}><Pressable style={s.secondary} onPress={onClose}><Text style={s.secondaryText}>Keep on today</Text></Pressable><Pressable style={s.confirmPrimary} onPress={onConfirm}><Text style={s.primaryText}>Yes, tomorrow</Text></Pressable></View>
  </Sheet>;
}

function AppointmentModal({ visible, appointment, onClose, onSave }: { visible: boolean; appointment?: Appointment; onClose: () => void; onSave: (input: Omit<Appointment, 'notificationId' | 'createdAt' | 'agenda'> & { existing?: Appointment }) => void }) {
  const defaultDate = useMemo(() => { const value = new Date(); value.setDate(value.getDate() + 1); value.setHours(10, 0, 0, 0); return value; }, []);
  const [title, setTitle] = useState(''); const [location, setLocation] = useState(''); const [date, setDate] = useState(defaultDate); const [minutes, setMinutes] = useState(120); const [picker, setPicker] = useState<PickerMode>(null);
  useEffect(() => { if (visible) { setTitle(appointment?.title ?? ''); setLocation(appointment?.location ?? ''); setDate(appointment ? new Date(appointment.startsAt) : defaultDate); setMinutes(appointment?.reminderMinutes ?? 120); setPicker(null); } }, [visible, appointment, defaultDate]);
  function changeDate(_event: DateTimePickerEvent, value?: Date) { if (Platform.OS === 'android') setPicker(null); if (value) setDate(value); }
  function openPicker(mode: Exclude<PickerMode, null>) { Keyboard.dismiss(); setPicker(mode); }
  function submit() { if (title.trim()) onSave({ id: appointment?.id ?? makeId('appointment'), title: title.trim(), startsAt: date.toISOString(), location: location.trim(), reminderMinutes: minutes, existing: appointment }); }
  return <Sheet visible={visible} onClose={onClose} eyebrow={appointment ? 'Edit appointment' : 'New appointment'} title="When do you need to be there?">
    <Field>Appointment name</Field><TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Doctor, teacher, contractor, meeting…" placeholderTextColor={C.muted} autoFocus />
    <Field>Date and time</Field><View style={s.dateRow}><Pressable style={s.dateButton} onPress={() => openPicker('date')} accessibilityRole="button" accessibilityLabel="Choose appointment date"><Text style={s.dateLabel}>DATE</Text><Text style={s.dateValue}>{shortDate.format(date)}</Text></Pressable><Pressable style={s.dateButton} onPress={() => openPicker('time')} accessibilityRole="button" accessibilityLabel="Choose appointment time"><Text style={s.dateLabel}>TIME</Text><Text style={s.dateValue}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}</Text></Pressable></View>
    {!!picker && <View style={s.pickerWrap}><DateTimePicker value={date} mode={picker} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={picker === 'date' ? new Date() : undefined} onChange={changeDate} />{Platform.OS === 'ios' && <Pressable onPress={() => setPicker(null)}><Text style={s.pickerDone}>Done</Text></Pressable>}</View>}
    <Field>Place or person (optional)</Field><TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="Office, address, person, or video call" placeholderTextColor={C.muted} />
    <Field>Remind me</Field><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{REMINDER_OPTIONS.map((option) => <Chip key={option.value} label={option.label} selected={minutes === option.value} onPress={() => setMinutes(option.value)} />)}</ScrollView>
    <Primary label={appointment ? 'Save changes' : 'Create appointment'} onPress={submit} disabled={!title.trim()} />
  </Sheet>;
}

function SettingsModal({ visible, enabled, onClose, onEnable, onPrivacy, onDeleteAll }: { visible: boolean; enabled: boolean; onClose: () => void; onEnable: () => void; onPrivacy: () => void; onDeleteAll: () => void }) {
  return <Sheet visible={visible} onClose={onClose} eyebrow="Gather Mind 0.5.2" title="Settings & privacy">
    <Field>Appointment reminders</Field>
    <View style={s.reminderStatus}><View style={[s.statusDot, enabled && s.statusDotOn]} /><View style={s.flex}><Text style={s.cardTitle}>{enabled ? 'Reminders are enabled' : 'Reminders are off'}</Text><Text style={s.small}>Scheduled locally by your phone. No account, internet connection, or backend is needed.</Text></View></View>
    {!enabled && <Primary label="Enable reminders" onPress={onEnable} />}
    <Text style={s.privacy}>Your phone may delay notifications in Focus, Do Not Disturb, or extreme battery-saving modes.</Text>
    <Field>Privacy & support</Field>
    <View style={s.privacySummary}><Text style={s.cardTitle}>Private by default</Text><Text style={s.small}>Your content stays on this phone. Gather Mind has no account, ads, analytics, backend, or remote sync.</Text></View>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={onPrivacy}><Text style={s.secondaryText}>Read privacy & support</Text></Pressable>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll}><Text style={s.dangerText}>Delete all local data</Text></Pressable>
  </Sheet>;
}

function PrivacyModal({ visible, onClose, onDeleteAll }: { visible: boolean; onClose: () => void; onDeleteAll: () => void }) {
  return <Sheet visible={visible} onClose={onClose} eyebrow="Effective 18 August 2026" title="Privacy, data & support">
    <View style={s.privacySummary}><Text style={s.cardTitle}>Your data stays on your device</Text><Text style={s.small}>Gather Mind 0.5.2 does not collect, transmit, sell, or share your thoughts, goals, appointments, or usage data.</Text></View>
    <Field>What the app stores</Field>
    <Text style={s.policyText}>The content you enter is stored in the app’s private local storage. Appointment reminders are scheduled by your phone’s operating system. No account, advertising, analytics, cloud sync, or backend service is used.</Text>
    <Field>Permissions</Field>
    <Text style={s.policyText}>Notification and exact-alarm access are used only to deliver reminders you choose. You can deny notifications and continue using the rest of the app.</Text>
    <Field>Retention and deletion</Field>
    <Text style={s.policyText}>Data remains until you delete individual items, use the control below, clear the app’s storage, or uninstall the app. Delete all also cancels Gather Mind’s scheduled reminders. Android cloud backup is disabled for this app.</Text>
    <Field>Support</Field>
    <Text style={s.policyText}>For a reminder problem, check Android notifications, Special app access → Alarms & reminders, Focus, Do Not Disturb, and battery settings. Open and save the appointment again after changing permissions.</Text>
    <Pressable style={[s.secondary, s.wideSecondary, s.spacedButton]} onPress={() => void Linking.openURL('https://github.com/fezdk/gather_mind/issues?subject=Gather%20Mind%20support')}><Text style={s.secondaryText}>Email https://github.com/fezdk/gather_mind/issues</Text></Pressable>
    <Text style={s.disclaimer}>Gather Mind is an organisational aid, not a medical device, diagnostic tool, treatment, or substitute for professional care. The source code is Apache-2.0 licensed; that software licence does not grant anyone rights to your personal content.</Text>
    <Pressable style={[s.dangerButton, s.modalDanger]} onPress={onDeleteAll}><Text style={s.dangerText}>Delete all local data</Text></Pressable>
  </Sheet>;
}

function Sheet({ visible, onClose, eyebrow, title, children }: { visible: boolean; onClose: () => void; eyebrow: string; title: string; children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={[s.sheet, { paddingBottom: 18 + bottom }]}><View style={s.handle} /><View style={s.between}><View style={s.flex}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sheetTitle}>{title}</Text></View><Pressable style={s.close} onPress={onClose} accessibilityLabel="Close"><Text style={s.closeText}>×</Text></Pressable></View><ScrollView contentContainerStyle={s.sheetBody} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets>{children}</ScrollView></View></KeyboardAvoidingView></Modal>;
}

function AppointmentCard({ appointment, linkedCount, onPress }: { appointment: Appointment; linkedCount: number; onPress: () => void }) {
  const date = new Date(appointment.startsAt); const total = appointment.agenda.length + linkedCount;
  return <Pressable style={s.appointmentCard} onPress={onPress}><View style={s.dateBlock}><Text style={s.dateMonth}>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date)}</Text><Text style={s.dateDay}>{date.getDate()}</Text></View><View style={s.flex}><Text style={s.cardTitle} numberOfLines={1}>{appointment.title}</Text><Text style={s.small}>{new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(date)}</Text><Text style={s.reminderLine}>{appointment.notificationId ? '◷ Reminder set' : '◷ Reminder off'} · {total} items</Text></View><Text style={s.chevron}>›</Text></Pressable>;
}

function ThoughtRow({ thought, color, onPress }: { thought: Thought; color: string; onPress: () => void }) { return <Pressable style={s.thread} onPress={onPress} accessibilityHint="Opens this thought"><View style={[s.threadDot, { backgroundColor: color }]} /><View style={s.flex}><Text style={s.threadText} numberOfLines={2}>{thought.text}</Text><Text style={s.tags}>{thought.tags.join(' · ') || 'Unsorted'}</Text></View><Text style={s.threadChevron}>›</Text></Pressable>; }
function Section({ eyebrow, title }: { eyebrow: string; title: string }) { return <View style={s.section}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text></View>; }
function Empty({ title, body }: { title: string; body: string }) { return <View style={s.empty}><Text style={s.cardTitle}>{title}</Text><Text style={s.small}>{body}</Text></View>; }
function Field({ children }: { children: ReactNode }) { return <Text style={s.field}>{children}</Text>; }
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable style={[s.chip, selected && s.chipSelected]} onPress={onPress}><Text style={[s.chipText, selected && s.chipTextSelected]}>{label}</Text></Pressable>; }
function Primary({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { return <Pressable style={[s.primary, disabled && s.disabled]} onPress={onPress} disabled={disabled}><Text style={s.primaryText}>{label}</Text></Pressable>; }
function NavButton({ label, symbol, active, onPress }: { label: string; symbol: string; active: boolean; onPress: () => void }) { return <Pressable style={s.navButton} onPress={onPress}><Text style={[s.navSymbol, active && s.navActive]}>{symbol}</Text><Text style={[s.navLabel, active && s.navActive]}>{label}</Text></Pressable>; }

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.paper }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: C.paper }, loadingText: { color: C.muted }, flex: { flex: 1 },
  topbar: { height: 62, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }, brand: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandText: { color: C.ink, fontWeight: '700', fontSize: 16 },
  brandMark: { width: 30, height: 28 }, dotOne: { position: 'absolute', width: 18, height: 18, borderRadius: 10, borderWidth: 2, borderColor: C.sageDark, top: 0 }, dotTwo: { position: 'absolute', width: 17, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.sageDark, right: 0, top: 4 }, dotThree: { position: 'absolute', width: 18, height: 17, borderRadius: 10, borderWidth: 2, borderColor: C.sageDark, left: 7, bottom: 0, backgroundColor: C.paper }, settings: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, settingsIcon: { color: C.sageDark, fontSize: 20 },
  content: { flex: 1 }, body: { padding: 22, paddingBottom: 112 }, detailBody: { padding: 20, paddingBottom: 42 }, eyebrow: { color: C.sageDark, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 6 }, title: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 38, lineHeight: 43, fontWeight: '600', letterSpacing: -1.2 }, subtitle: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 4, marginBottom: 18 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  capture: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, borderRadius: 23, backgroundColor: C.sageDark, marginTop: 22, marginBottom: 8 }, plus: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.sagePale, alignItems: 'center', justifyContent: 'center' }, plusText: { color: C.sageDark, fontSize: 28 }, captureTitle: { color: C.white, fontWeight: '700', fontSize: 17 }, captureSub: { color: '#FFFFFFB8', marginTop: 3, fontSize: 13 }, arrow: { color: C.white, fontSize: 30 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, backgroundColor: C.yellow, borderRadius: 17, marginTop: 10 }, smallPrimary: { backgroundColor: C.sageDark, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11 }, smallPrimaryText: { color: C.white, fontWeight: '700', fontSize: 12 }, section: { marginTop: 30, marginBottom: 12 }, sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 12 }, sectionTitle: { color: C.ink, fontSize: 19, fontWeight: '700' }, scheduleSmall: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.sagePale }, scheduleSmallText: { color: C.sageDark, fontSize: 12, fontWeight: '800' },
  taskHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 30, marginBottom: 10 }, taskAdd: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: C.sageDark }, taskAddText: { color: C.white, fontSize: 25, marginTop: -2 }, progressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: C.line }, progressFill: { height: 6, borderRadius: 3, backgroundColor: C.sage }, swipeHint: { color: C.muted, fontSize: 10, textAlign: 'center', marginVertical: 9 }, taskList: { gap: 8 },
  swipeShell: { overflow: 'hidden', borderRadius: 16, backgroundColor: C.sageDark }, swipeUnder: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }, completeReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, tomorrowReveal: { color: C.white, fontSize: 11, fontWeight: '800' }, lockedReveal: { color: C.sagePale }, taskRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: C.line }, taskCheck: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1.5, borderColor: C.sageDark, backgroundColor: '#FFFFFF88' }, taskCheckDone: { borderColor: C.sageDark, backgroundColor: C.sageDark }, taskCheckText: { color: C.white, fontWeight: '900' }, taskText: { color: C.ink, fontSize: 14, fontWeight: '700', lineHeight: 19 }, taskDone: { color: C.muted, textDecorationLine: 'line-through' }, taskMeta: { flexDirection: 'row', gap: 7, marginTop: 4 }, dailyBadge: { color: C.sageDark, fontSize: 10, fontWeight: '800' }, movedText: { color: '#8E4F43', fontSize: 10, fontWeight: '800' }, tomorrowButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFFFFF80' }, tomorrowButtonText: { color: C.sageDark, fontSize: 19, fontWeight: '800' }, lockIcon: { color: C.sageDark, fontSize: 11 },
  tomorrowBox: { marginTop: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }, tomorrowTitle: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 9 }, tomorrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }, tomorrowEdit: { flex: 1, paddingVertical: 4 }, stressDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#00000010' }, tomorrowText: { color: C.ink, fontSize: 13, fontWeight: '600' }, restoreButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, backgroundColor: C.sagePale }, restoreText: { color: C.sageDark, fontSize: 10, fontWeight: '800' },
  appointmentCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 22, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, dateBlock: { width: 64, height: 68, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sagePale }, dateMonth: { color: C.sageDark, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, dateDay: { color: C.sageDark, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 29, fontWeight: '600' }, cardTitle: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 3 }, small: { color: C.muted, fontSize: 12, lineHeight: 17 }, reminderLine: { color: C.sageDark, fontSize: 11, fontWeight: '600', marginTop: 7 }, chevron: { color: C.muted, fontSize: 28 },
  empty: { padding: 22, alignItems: 'center', gap: 3, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line, backgroundColor: C.card }, thread: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 9 }, threadDot: { width: 10, height: 10, borderRadius: 5 }, threadText: { color: C.ink, fontSize: 14, fontWeight: '600', lineHeight: 19 }, threadChevron: { color: C.muted, fontSize: 23 }, tags: { color: C.muted, fontSize: 11, marginTop: 3 },
  search: { height: 50, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, color: C.ink, fontSize: 15 }, cloudCard: { padding: 14, backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, marginTop: 15 }, link: { color: C.sageDark, fontSize: 12, fontWeight: '700', padding: 8 }, cloud: { minHeight: 300, paddingVertical: 18, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10 }, bubble: { width: 92, height: 92, borderRadius: 46, padding: 10, alignItems: 'center', justifyContent: 'center' }, bubbleLarge: { width: 116, height: 116, borderRadius: 58 }, bubbleText: { color: C.ink, fontSize: 11, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  scheduleAction: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: C.sageDark, paddingHorizontal: 18 }, scheduleActionText: { color: C.white, fontSize: 14, fontWeight: '800' }, calendarList: { gap: 22, marginTop: 26 }, calendarDay: { gap: 10 }, calendarDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 }, calendarDayDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.sage }, calendarDayLabel: { color: C.sageDark, fontSize: 12, fontWeight: '800' }, calendarDayCards: { gap: 10, paddingLeft: 13, borderLeftWidth: 1, borderLeftColor: C.line }, nav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 78, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.card, paddingBottom: Platform.OS === 'ios' ? 12 : 4 }, navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, navSymbol: { color: C.muted, fontSize: 23 }, navLabel: { color: C.muted, fontSize: 10, fontWeight: '600' }, navActive: { color: C.sageDark, fontWeight: '800' },
  back: { color: C.sageDark, fontWeight: '700', marginBottom: 16, fontSize: 14 }, hero: { backgroundColor: C.sageDark, borderRadius: 23, padding: 22 }, heroEyebrow: { color: C.sagePale, textTransform: 'uppercase', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroTitle: { color: C.white, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 31, fontWeight: '600', marginTop: 6, marginBottom: 15 }, heroFact: { color: '#FFFFFFD1', fontSize: 14, marginBottom: 7 }, reminderPill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, backgroundColor: C.sagePale }, reminderPillText: { color: C.sageDark, fontSize: 11, fontWeight: '700' },
  planIntro: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: -4, marginBottom: 13 }, agenda: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 8 }, agendaContent: { flex: 1, paddingVertical: 2 }, checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.sage, alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: C.sageDark, borderColor: C.sageDark }, check: { color: C.white, fontWeight: '800' }, agendaText: { color: C.ink, fontSize: 14, lineHeight: 20 }, editHint: { color: C.muted, fontSize: 10, marginTop: 3 }, done: { color: C.muted, textDecorationLine: 'line-through' }, planAddButton: { flex: 0, marginTop: 5 }, linked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: C.peach, marginBottom: 8 }, detailActions: { flexDirection: 'row', gap: 9, marginTop: 28 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 14 }, secondaryText: { color: C.sageDark, fontWeight: '700', fontSize: 13 }, dangerButton: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#9E51484D', backgroundColor: C.card }, dangerText: { color: C.danger, fontWeight: '700' }, modalDanger: { flex: 0, marginTop: 10 }, modalCopy: { color: C.muted, fontSize: 13, lineHeight: 19 }, confirmPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, marginBottom: 14 }, confirmDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#00000012' }, confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 }, confirmPrimary: { flex: 1, minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sageDark, paddingHorizontal: 14 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#25322F73' }, sheet: { maxHeight: '90%', paddingTop: 8, paddingHorizontal: 22, paddingBottom: Platform.OS === 'ios' ? 24 : 18, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: C.paper }, handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#D4D2CA', marginBottom: 15 }, sheetTitle: { color: C.ink, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 25, fontWeight: '600' }, close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, closeText: { color: C.muted, fontSize: 25 }, sheetBody: { paddingTop: 20, paddingBottom: 10 }, field: { color: C.ink, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 14 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, color: C.ink, paddingHorizontal: 14, fontSize: 15 }, textarea: { minHeight: 105, paddingTop: 13, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: 8, paddingBottom: 4 }, chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, chipSelected: { backgroundColor: C.sageDark, borderColor: C.sageDark }, chipText: { color: C.muted, fontSize: 12, fontWeight: '600' }, chipTextSelected: { color: C.white }, primary: { minHeight: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.sageDark, marginTop: 22 }, primaryText: { color: C.white, fontSize: 14, fontWeight: '800' }, disabled: { opacity: .45 }, taskTypeChoices: { gap: 8 }, taskType: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card }, taskTypeSelected: { borderColor: C.sageDark, backgroundColor: C.sagePale }, taskTypeTitle: { color: C.ink, fontSize: 14, fontWeight: '800', marginBottom: 2 }, dailyNote: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 13, backgroundColor: C.yellow, marginTop: 10 }, dailyNoteIcon: { color: C.sageDark, fontSize: 12 }, dateRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, dateButton: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, padding: 13 }, dateLabel: { color: C.sageDark, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, dateValue: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }, pickerWrap: { marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: C.card }, pickerDone: { color: C.sageDark, fontWeight: '800', textAlign: 'right', padding: 12 },
  reminderStatus: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.muted, marginTop: 4 }, statusDotOn: { backgroundColor: C.sage }, spacedButton: { marginTop: 12 }, wideSecondary: { flex: 0 }, linkThoughtButton: { marginTop: 10 }, privacy: { color: C.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 15 }, privacySummary: { padding: 16, borderRadius: 16, backgroundColor: C.sagePale, borderWidth: 1, borderColor: C.line }, policyText: { color: C.muted, fontSize: 13, lineHeight: 20 }, disclaimer: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 20, padding: 14, borderRadius: 13, backgroundColor: C.yellow }, toast: { position: 'absolute', left: 24, right: 24, bottom: 94, padding: 13, borderRadius: 13, backgroundColor: C.ink }, toastText: { color: C.white, textAlign: 'center', fontSize: 13, fontWeight: '600' },
});
