import { renderEffectiveSchedule } from '../../src/modules/schedules/schedule-renderer';
import type { ScheduleEntryForRender, ScheduleExceptionForRender } from '../../src/modules/schedules/schedules.types';

const activity = (id: string, name: string) => ({
  id,
  name,
  categoryId: null,
  category: null,
  alarmEnabled: false,
  alarmOffsetMinutes: 5,
  isActive: true,
});

function makeEntry(overrides: Partial<ScheduleEntryForRender>): ScheduleEntryForRender {
  return {
    id: 'entry-1',
    activityId: 'activity-1',
    startTime: '04:00',
    endTime: '04:30',
    recurrenceType: 'DAILY',
    daysOfWeek: [],
    oneTimeDate: null,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveUntil: null,
    isActive: true,
    alarmEnabled: null,
    alarmOffsetMinutes: null,
    timelessReminderTime: null,
    activity: activity('activity-1', 'Meditation'),
    ...overrides,
  };
}

describe('renderEffectiveSchedule', () => {
  it('renders a DAILY entry for any date on/after effectiveFrom', () => {
    const entries = [makeEntry({})];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.activityName).toBe('Meditation');
    expect(result[0]!.startTime).toBe('04:00');
  });

  it('does not render a DAILY entry before its effectiveFrom date', () => {
    const entries = [makeEntry({ effectiveFrom: new Date('2026-06-01T00:00:00.000Z') })];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, []);
    expect(result).toHaveLength(0);
  });

  it('renders a WEEKDAYS entry only on matching days of week', () => {
    // 2026-03-16 is a Monday (day 1); 2026-03-15 is a Sunday (day 0).
    const entries = [makeEntry({ recurrenceType: 'WEEKDAYS', daysOfWeek: [1, 3, 5] })];
    expect(renderEffectiveSchedule('2026-03-16', 'UTC', entries, [])).toHaveLength(1);
    expect(renderEffectiveSchedule('2026-03-15', 'UTC', entries, [])).toHaveLength(0);
  });

  it('renders a ONE_TIME entry only on its exact date', () => {
    const entries = [
      makeEntry({ recurrenceType: 'ONE_TIME', oneTimeDate: new Date('2026-04-01T00:00:00.000Z') }),
    ];
    expect(renderEffectiveSchedule('2026-04-01', 'UTC', entries, [])).toHaveLength(1);
    expect(renderEffectiveSchedule('2026-04-02', 'UTC', entries, [])).toHaveLength(0);
  });

  it('assigns a midnight-crossing occurrence to the date it starts on, with plannedEnd the next day', () => {
    const entries = [makeEntry({ startTime: '23:30', endTime: '00:30' })];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, []);
    expect(result).toHaveLength(1);
    expect(result[0]!.crossesMidnight).toBe(true);
    expect(result[0]!.plannedStartUtc!.toISOString()).toBe('2026-03-15T23:30:00.000Z');
    expect(result[0]!.plannedEndUtc!.toISOString()).toBe('2026-03-16T00:30:00.000Z');
  });

  it('applies a SKIP exception by removing the base occurrence', () => {
    const entries = [makeEntry({})];
    const exceptions: ScheduleExceptionForRender[] = [
      {
        id: 'ex-1',
        sourceScheduleEntryId: 'entry-1',
        activityId: 'activity-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        startTime: null,
        endTime: null,
        timelessReminderTime: null,
        action: 'SKIP',
        reason: null,
        activity: activity('activity-1', 'Meditation'),
      },
    ];
    expect(renderEffectiveSchedule('2026-03-15', 'UTC', entries, exceptions)).toHaveLength(0);
  });

  it('applies a MOVE exception by changing only the time for that date', () => {
    const entries = [makeEntry({})];
    const exceptions: ScheduleExceptionForRender[] = [
      {
        id: 'ex-1',
        sourceScheduleEntryId: 'entry-1',
        activityId: 'activity-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        startTime: '05:00',
        endTime: '05:30',
        timelessReminderTime: null,
        action: 'MOVE',
        reason: 'overslept',
        activity: activity('activity-1', 'Meditation'),
      },
    ];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, exceptions);
    expect(result).toHaveLength(1);
    expect(result[0]!.startTime).toBe('05:00');

    // The base schedule (a different date) is unaffected.
    const otherDay = renderEffectiveSchedule('2026-03-16', 'UTC', entries, exceptions);
    expect(otherDay[0]!.startTime).toBe('04:00');
  });

  it('adds a standalone ad-hoc activity without touching the base schedule', () => {
    const entries = [makeEntry({})];
    const exceptions: ScheduleExceptionForRender[] = [
      {
        id: 'ex-2',
        sourceScheduleEntryId: null,
        activityId: 'activity-2',
        date: new Date('2026-03-15T00:00:00.000Z'),
        startTime: '20:00',
        endTime: '22:30',
        timelessReminderTime: null,
        action: 'ADD',
        reason: null,
        activity: activity('activity-2', 'Play'),
      },
    ];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, exceptions);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.activityName).sort()).toEqual(['Meditation', 'Play']);
  });

  it('returns occurrences sorted chronologically', () => {
    const entries = [
      makeEntry({ id: 'e1', startTime: '18:00', endTime: '18:30', activity: activity('a1', 'Evening') }),
      makeEntry({ id: 'e2', startTime: '04:00', endTime: '04:30', activity: activity('a2', 'Morning') }),
    ];
    const result = renderEffectiveSchedule('2026-03-15', 'UTC', entries, []);
    expect(result.map((r) => r.activityName)).toEqual(['Morning', 'Evening']);
  });
});
