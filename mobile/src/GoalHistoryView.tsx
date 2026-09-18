import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from './DateTimePicker';
import { dateKeyAfter, localDateFromKey, localDateKey, type GoalDaySnapshot } from './model';
import { goalDaySummary, historyCalendarDays, historyMonthShift, historyMonthStart, historyWeekStart } from './goal-history';
import type { ThemeColors } from './theme';

type Props = {
  history: GoalDaySnapshot[];
  today: string;
  colors: ThemeColors;
  bottomInset: number;
  onBack: () => void;
};
const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const shortLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const MIN_DATE = '1900-01-01';

export function GoalHistoryView({ history, today, colors: C, bottomInset, onBack }: Props) {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [selected, setSelected] = useState(() => dateKeyAfter(today, -1));
  const [picker, setPicker] = useState(false);
  const { fontScale, width } = useWindowDimensions();
  const largeText = fontScale > 1.3 || width < 380;
  const s = useMemo(() => styles(C), [C]);
  const byDate = useMemo(() => new Map(history.filter(day => day.date < today).map(day => [day.date, day])), [history, today]);
  const yesterday = dateKeyAfter(today, -1);
  const selectedDay = selected < today ? selected : yesterday;
  const days = historyCalendarDays(selectedDay, mode);
  const record = byDate.get(selectedDay);
  const start = mode === 'week' ? historyWeekStart(selectedDay) : historyMonthStart(selectedDay);
  const latestStart = mode === 'week' ? historyWeekStart(yesterday) : historyMonthStart(yesterday);
  const canNext = start < latestStart;
  const canPrevious = start > MIN_DATE;
  const detailTop = useRef(0);
  const scroller = useRef<ScrollView | null>(null);
  useEffect(() => { if (selected >= today) setSelected(yesterday); }, [today, selected, yesterday]);

  function movePeriod(delta: number) {
    const next = mode === 'week' ? dateKeyAfter(selectedDay, delta * 7) : historyMonthShift(selectedDay, delta);
    setSelected(next < MIN_DATE ? MIN_DATE : next > yesterday ? yesterday : next);
  }
  function selectDay(date: string) { if (date >= MIN_DATE && date < today) setSelected(date); }

  const periodLabel = mode === 'month' ? monthLabel.format(localDateFromKey(selectedDay))
    : `${shortLabel.format(localDateFromKey(start))} – ${shortLabel.format(localDateFromKey(dateKeyAfter(start, 6)))} · ${localDateFromKey(selectedDay).getFullYear()}`;
  return <ScrollView ref={scroller} style={s.content} contentContainerStyle={[s.body, { paddingBottom: 32 + bottomInset }]}>
    <Pressable style={s.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to Today"><MaterialIcons name="chevron-left" size={21} color={C.accentText} /><Text style={s.link}>Today</Text></Pressable>
    <Text style={s.title} accessibilityRole="header">Previous days</Text>
    <View style={s.readonly}><MaterialIcons name="lock-outline" size={15} color={C.muted} /><Text style={s.muted}>Goal history · view only</Text></View>
    <View style={s.modes} accessibilityRole="tablist">{(['week', 'month'] as const).map(value => <Pressable key={value} style={[s.mode, value === mode && s.selected]} onPress={() => setMode(value)} accessibilityRole="tab" accessibilityState={{ selected: value === mode }}><Text style={s.modeText}>{value === 'week' ? 'Week' : 'Month'}</Text></Pressable>)}</View>
    <View style={s.period}>
      <Pressable style={s.arrow} onPress={() => movePeriod(-1)} disabled={!canPrevious} accessibilityRole="button" accessibilityState={{ disabled: !canPrevious }} accessibilityLabel={`Previous ${mode}`}><MaterialIcons name="chevron-left" size={25} color={canPrevious ? C.accentText : C.muted} /></Pressable>
      <Pressable style={s.periodTitle} onPress={() => setPicker(true)} accessibilityRole="button" accessibilityLabel={`${periodLabel}. Choose a date`}><Text style={s.periodText}>{periodLabel}</Text><MaterialIcons name="calendar-today" size={17} color={C.accentText} /></Pressable>
      <Pressable style={s.arrow} onPress={() => movePeriod(1)} disabled={!canNext} accessibilityRole="button" accessibilityState={{ disabled: !canNext }} accessibilityLabel={`Next ${mode}`}><MaterialIcons name="chevron-right" size={25} color={canNext ? C.accentText : C.muted} /></Pressable>
    </View>
    {picker && <View><DateTimePicker mode="date" value={localDateFromKey(selectedDay)} minimumDate={localDateFromKey(MIN_DATE)} maximumDate={localDateFromKey(yesterday)} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(event, date) => { if (Platform.OS === 'android' || event.type !== 'set') setPicker(false); if (event.type === 'set' && date) selectDay(localDateKey(date)); }} />{Platform.OS === 'ios' && <Pressable style={s.back} onPress={() => setPicker(false)} accessibilityRole="button"><Text style={s.link}>Done</Text></Pressable>}</View>}
    {largeText && <Pressable style={s.back} accessibilityRole="button" onPress={() => scroller.current?.scrollTo({ y: detailTop.current, animated: false })}><Text style={s.link}>Jump to selected day’s goals ↓</Text></Pressable>}
    {!largeText && <View style={s.weekdays}>{Array.from({ length: 7 }, (_, index) => <Text key={index} style={s.weekday} importantForAccessibility="no">{weekdayLabel.format(localDateFromKey(dateKeyAfter('2026-09-14', index)))}</Text>)}</View>}
    <View style={!largeText && s.grid}>{days.map((date, index) => {
      if (!date) return largeText ? null : <View key={`blank-${index}`} style={s.cell} />;
      const snapshot = byDate.get(date);
      const total = snapshot?.goals.length ?? 0;
      const done = snapshot?.goals.filter(goal => goal.completed).length ?? 0;
      const disabled = date >= today || date < MIN_DATE;
      const label = disabled ? 'History not yet available' : goalDaySummary(snapshot);
      return <Pressable key={date} style={[largeText ? s.largeDay : s.cell, date === selectedDay && s.selectedDay]} onPress={() => selectDay(date)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${dayLabel.format(localDateFromKey(date))}. ${label}`} accessibilityState={{ selected: date === selectedDay, disabled }}>
        {largeText ? <><Text style={s.goalTitle}>{dayLabel.format(localDateFromKey(date))}</Text><Text style={s.muted}>{label}</Text></> : <>
          <View style={s.dateCircle}>{mode === 'month' && total > 0 && <View style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">{Array.from({ length: 24 }, (_, tick) => {
            const angle = tick * 2 * Math.PI / 24;
            return <View key={tick} style={{ position: 'absolute', width: 2, height: 3, borderRadius: 1, left: 17 + Math.sin(angle) * 16, top: 16.5 - Math.cos(angle) * 16, transform: [{ rotate: `${tick * 15}deg` }], backgroundColor: tick / 24 < done / total ? C.accentText : C.line }} />;
          })}</View>}<Text style={[s.dayNumber, disabled && s.muted]}>{localDateFromKey(date).getDate()}</Text></View>
          {mode === 'week' && <View style={s.smallTrack} importantForAccessibility="no"><View style={[s.fill, { width: `${total ? done / total * 100 : 0}%` }]} /></View>}
          <Text style={s.count}>{disabled ? ' ' : !snapshot ? '—' : !total ? '·' : `${done}/${total}`}</Text>
        </>}
      </Pressable>;
    })}</View>
    <Text style={s.legend}>Completed / planned{'\n'}· No goals planned     — No saved history</Text>
    <View onLayout={event => { detailTop.current = event.nativeEvent.layout.y; }} style={s.detail} collapsable={false}>
      <Text style={s.dayHeading} accessibilityRole="header">{dayLabel.format(localDateFromKey(selectedDay))}</Text>
      <Text style={s.summary} accessibilityLiveRegion="polite">{goalDaySummary(record)}</Text>
      {!record ? <View style={s.empty}><Text style={s.goalTitle}>No saved history</Text><Text style={s.note}>History is recorded from this update onwards, on days you use Gather Mind. Missing records do not mean nothing was completed.</Text></View>
        : !record.goals.length ? <View style={s.empty}><Text style={s.goalTitle}>No goals planned</Text><Text style={s.note}>The saved list was empty on this day.</Text></View>
        : record.goals.map(goal => <View key={goal.id} style={s.goal}>
          <View style={s.goalHeading}><MaterialIcons name={goal.completed ? 'check' : 'remove'} color={C.accentText} size={22} importantForAccessibility="no" /><View style={s.flex}><Text style={s.goalTitle}>{goal.title}</Text><Text style={s.muted}>{goal.completed ? 'Completed' : 'Still open at the end of the day'}{goal.recurrence !== 'once' ? ` · ${goal.recurrence}` : ''}</Text></View></View>
          {!!goal.steps.length && <View style={s.steps}><Text style={s.muted}>{goal.steps.filter(step => step.completed).length} of {goal.steps.length} steps completed</Text>{goal.steps.map(step => <View key={step.id} style={s.step}><MaterialIcons name={step.completed ? 'check' : 'remove'} size={17} color={C.accentText} importantForAccessibility="no" /><Text style={s.stepText} accessibilityLabel={`${step.text}. ${step.completed ? 'Completed' : 'Not completed'}`}>{step.text}</Text></View>)}</View>}
        </View>)}
      {!!record && <Text style={s.note}>The last saved state of this day. Later edits or removal of a goal do not change this record.</Text>}
    </View>
  </ScrollView>;
}

function styles(C: ThemeColors) { return StyleSheet.create({
  content: { flex: 1 }, body: { paddingHorizontal: 22 }, flex: { flex: 1 },
  back: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }, link: { color: C.accentText, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  title: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', color: C.ink, fontSize: 34, lineHeight: 39, fontWeight: '600', letterSpacing: -1 },
  readonly: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 9, marginBottom: 18 }, muted: { color: C.muted, fontSize: 12, flexShrink: 1 },
  modes: { borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 14, padding: 3, flexDirection: 'row', gap: 3 },
  mode: { flex: 1, minHeight: 48, padding: 8, borderRadius: 11, justifyContent: 'center', alignItems: 'center' }, selected: { backgroundColor: C.sagePale }, modeText: { color: C.accentText, fontSize: 14, fontWeight: '700' },
  period: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 }, arrow: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  periodTitle: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 }, periodText: { color: C.ink, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  weekdays: { flexDirection: 'row', paddingBottom: 4 }, weekday: { flex: 1, textAlign: 'center', color: C.muted, fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: `${100 / 7}%`, minHeight: 62, paddingVertical: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  selectedDay: { backgroundColor: C.sagePale, borderColor: C.accentText }, dateCircle: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }, dayNumber: { color: C.ink, fontSize: 14 }, count: { color: C.muted, fontSize: 10, marginTop: 2 },
  smallTrack: { width: 26, height: 4, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }, fill: { height: '100%', backgroundColor: C.accentText },
  largeDay: { borderWidth: 1, borderColor: C.line, borderRadius: 12, minHeight: 48, padding: 12, marginVertical: 3, gap: 5 },
  legend: { color: C.muted, fontSize: 11, marginTop: 12, marginBottom: 20 }, detail: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 18 }, dayHeading: { color: C.ink, fontSize: 19, fontWeight: '700' }, summary: { color: C.muted, fontSize: 13, marginTop: 5, marginBottom: 12 },
  goal: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 9 }, goalHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, goalTitle: { color: C.ink, fontSize: 14, fontWeight: '700', marginBottom: 5 },
  steps: { marginLeft: 32, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }, step: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 9 }, stepText: { flex: 1, color: C.ink, fontSize: 13 },
  empty: { padding: 16, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line }, note: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 10 },
}); }
