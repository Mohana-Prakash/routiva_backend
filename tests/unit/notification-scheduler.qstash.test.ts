import { DateTime } from 'luxon';
import type { RenderedOccurrence } from '../../src/modules/schedules/schedules.types';

const mockPublishJSON = jest.fn();
const mockMessagesGet = jest.fn();
const mockMessagesDelete = jest.fn();
const mockIsQStashPublishingConfigured = jest.fn(() => true);
const mockGetApiBaseUrl = jest.fn(() => 'https://api.example.test');

jest.mock('../../src/common/qstash/qstash.util', () => ({
  isQStashPublishingConfigured: () => mockIsQStashPublishingConfigured(),
  getApiBaseUrl: () => mockGetApiBaseUrl(),
  getQStashClient: () => ({
    publishJSON: mockPublishJSON,
    messages: { get: mockMessagesGet, delete: mockMessagesDelete },
  }),
}));

const mockFindJobByKey = jest.fn();
const mockUpsertJob = jest.fn();
const mockSetQStashMessageId = jest.fn();
const mockGetOrCreatePreferences = jest.fn();
const mockCancelJobsForActivityLogIds = jest.fn();

jest.mock('../../src/modules/notifications/notifications.repository', () => ({
  notificationsRepository: {
    findJobByKey: (...args: unknown[]) => mockFindJobByKey(...args),
    upsertJob: (...args: unknown[]) => mockUpsertJob(...args),
    setQStashMessageId: (...args: unknown[]) => mockSetQStashMessageId(...args),
    getOrCreatePreferences: (...args: unknown[]) => mockGetOrCreatePreferences(...args),
    cancelJobsForActivityLogIds: (...args: unknown[]) => mockCancelJobsForActivityLogIds(...args),
  },
}));

import { cancelRemindersForActivityLogs, scheduleOrUpdateReminder } from '../../src/modules/notifications/notification-scheduler';

function makeOccurrence(overrides: Partial<RenderedOccurrence> = {}): RenderedOccurrence {
  const start = DateTime.utc().plus({ hours: 1 });
  const end = start.plus({ minutes: 30 });
  return {
    occurrenceKey: 'se:entry-1:2026-08-28',
    date: '2026-08-28',
    activityId: 'activity-1',
    activityName: 'Morning Run',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    startTime: start.toFormat('HH:mm'),
    endTime: end.toFormat('HH:mm'),
    plannedStartUtc: start.toJSDate(),
    plannedEndUtc: end.toJSDate(),
    crossesMidnight: false,
    source: 'RECURRING',
    scheduleEntryId: 'entry-1',
    exceptionId: null,
    exceptionAction: null,
    alarmEnabled: true,
    // 0 => a single 'timed-actionable' stage (plus 'end-check' whenever plannedEndUtc is set),
    // keeping most cases below to exactly one or two scheduleStage calls to reason about.
    alarmOffsetMinutes: 0,
    reminderAtUtc: null,
    ...overrides,
  };
}

const preferences = { quietHoursEnabled: false, quietHoursStart: null, quietHoursEnd: null, pushEnabled: true };

describe('scheduleOrUpdateReminder (QStash path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrCreatePreferences.mockResolvedValue(preferences);
    mockIsQStashPublishingConfigured.mockReturnValue(true);
    mockGetApiBaseUrl.mockReturnValue('https://api.example.test');
  });

  it('does nothing when QStash is not configured (e.g. local dev) — no fallback anymore', async () => {
    mockGetApiBaseUrl.mockReturnValue(''); // API_BASE_URL unset, as it deliberately is in local dev
    const occurrence = makeOccurrence();

    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    expect(mockPublishJSON).not.toHaveBeenCalled();
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('publishes a new QStash message with the exact occurrence time and stores the returned message id', async () => {
    mockFindJobByKey.mockResolvedValue(null);
    mockUpsertJob.mockResolvedValue({ id: 'job-1' });
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-abc' });

    const occurrence = makeOccurrence();
    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    // alarmOffsetMinutes: 0 + plannedEndUtc set -> 'timed-actionable' + 'end-check' = 2 stages.
    expect(mockPublishJSON).toHaveBeenCalledTimes(2);
    const [firstCall] = mockPublishJSON.mock.calls;
    expect(firstCall[0]).toMatchObject({
      url: 'https://api.example.test/notifications/qstash/deliver',
      notBefore: Math.floor((occurrence.plannedStartUtc as Date).getTime() / 1000),
      retries: 3,
    });
    expect(firstCall[0].body).toMatchObject({
      userId: 'user-1',
      activityLogId: 'log-1',
      activityName: 'Morning Run',
      kind: 'timed-actionable',
      notificationJobId: 'job-1',
    });
    expect(mockSetQStashMessageId).toHaveBeenCalledWith('job-1', 'msg-abc');
  });

  it("includes the occurrence's planned start time, formatted HH:mm in the target timezone, in the published payload", async () => {
    mockFindJobByKey.mockResolvedValue(null);
    mockUpsertJob.mockResolvedValue({ id: 'job-1' });
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-abc' });

    // Relative to "now" (like makeOccurrence's own default) so this doesn't depend on when the
    // suite happens to run. Asia/Kolkata (UTC+5:30) specifically, to prove this actually applies
    // the passed-in timezone rather than just echoing UTC wall-clock digits.
    const startUtc = DateTime.utc().plus({ hours: 1 });
    const expectedLocal = startUtc.setZone('Asia/Kolkata').toFormat('HH:mm');
    const occurrence = makeOccurrence({
      plannedStartUtc: startUtc.toJSDate(),
      plannedEndUtc: null, // isolate to the one 'timed-actionable' publish
    });

    await scheduleOrUpdateReminder('user-1', 'Asia/Kolkata', occurrence, 'log-1');

    expect(mockPublishJSON).toHaveBeenCalledTimes(1);
    const [[{ body }]] = mockPublishJSON.mock.calls;
    expect(body.startTime).toBe(expectedLocal);
  });

  it('omits startTime for a timeless occurrence (no plannedStartUtc)', async () => {
    mockFindJobByKey.mockResolvedValue(null);
    mockUpsertJob.mockResolvedValue({ id: 'job-1' });
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-abc' });

    const occurrence = makeOccurrence({
      plannedStartUtc: null,
      plannedEndUtc: null,
      reminderAtUtc: DateTime.utc().plus({ hours: 1 }).toJSDate(),
    });

    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    expect(mockPublishJSON).toHaveBeenCalledTimes(1);
    const [[{ body }]] = mockPublishJSON.mock.calls;
    expect(body.kind).toBe('timeless-actionable');
    expect(body.startTime).toBeUndefined();
  });

  it('skips republishing when the target time is unchanged and the QStash message still exists', async () => {
    const occurrence = { ...makeOccurrence(), plannedEndUtc: null }; // drop end-check, isolate to one stage

    mockFindJobByKey.mockResolvedValue({
      id: 'job-1',
      status: 'SCHEDULED',
      scheduledAt: occurrence.plannedStartUtc,
      qstashMessageId: 'msg-existing',
    });
    mockMessagesGet.mockResolvedValue({ messageId: 'msg-existing' });

    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    expect(mockMessagesGet).toHaveBeenCalledWith('msg-existing');
    expect(mockPublishJSON).not.toHaveBeenCalled();
    expect(mockUpsertJob).not.toHaveBeenCalled();
  });

  it('deletes the old QStash message and republishes when the target time actually changed', async () => {
    const occurrence = { ...makeOccurrence(), plannedEndUtc: null };
    const staleTime = DateTime.fromJSDate(occurrence.plannedStartUtc as Date).minus({ hours: 5 }).toJSDate();

    mockFindJobByKey.mockResolvedValue({
      id: 'job-1',
      status: 'SCHEDULED',
      scheduledAt: staleTime, // different from occurrence.plannedStartUtc -> must reschedule
      qstashMessageId: 'msg-stale',
    });
    mockUpsertJob.mockResolvedValue({ id: 'job-1' });
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-fresh' });

    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    expect(mockMessagesGet).not.toHaveBeenCalled(); // scheduledAt mismatch short-circuits before the existence check
    expect(mockMessagesDelete).toHaveBeenCalledWith('msg-stale');
    expect(mockPublishJSON).toHaveBeenCalledTimes(1);
    expect(mockSetQStashMessageId).toHaveBeenCalledWith('job-1', 'msg-fresh');
  });

  it('republishes when the previously-scheduled QStash message is gone (self-heals)', async () => {
    const occurrence = { ...makeOccurrence(), plannedEndUtc: null };

    mockFindJobByKey.mockResolvedValue({
      id: 'job-1',
      status: 'SCHEDULED',
      scheduledAt: occurrence.plannedStartUtc,
      qstashMessageId: 'msg-gone',
    });
    mockMessagesGet.mockRejectedValue(new Error('not found'));
    mockUpsertJob.mockResolvedValue({ id: 'job-1' });
    mockPublishJSON.mockResolvedValue({ messageId: 'msg-new' });

    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');

    expect(mockMessagesDelete).toHaveBeenCalledWith('msg-gone');
    expect(mockPublishJSON).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the occurrence has no alarm enabled', async () => {
    const occurrence = makeOccurrence({ alarmEnabled: false });
    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');
    expect(mockGetOrCreatePreferences).not.toHaveBeenCalled();
    expect(mockPublishJSON).not.toHaveBeenCalled();
  });

  it('does nothing when the user has push notifications disabled', async () => {
    mockGetOrCreatePreferences.mockResolvedValue({ ...preferences, pushEnabled: false });
    const occurrence = makeOccurrence();
    await scheduleOrUpdateReminder('user-1', 'UTC', occurrence, 'log-1');
    expect(mockPublishJSON).not.toHaveBeenCalled();
  });
});

describe('cancelRemindersForActivityLogs (QStash path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMessagesDelete.mockResolvedValue(undefined);
  });

  it('deletes the QStash message for every cancelled job that had one', async () => {
    mockCancelJobsForActivityLogIds.mockResolvedValue([
      { id: 'job-1', qstashMessageId: 'msg-1' },
      { id: 'job-2', qstashMessageId: null },
      { id: 'job-3', qstashMessageId: 'msg-3' },
    ]);

    await cancelRemindersForActivityLogs(['log-1', 'log-2', 'log-3']);

    expect(mockMessagesDelete).toHaveBeenCalledTimes(2);
    expect(mockMessagesDelete).toHaveBeenCalledWith('msg-1');
    expect(mockMessagesDelete).toHaveBeenCalledWith('msg-3');
  });

  it('does not throw when a QStash message is already gone', async () => {
    mockCancelJobsForActivityLogIds.mockResolvedValue([{ id: 'job-1', qstashMessageId: 'msg-1' }]);
    mockMessagesDelete.mockRejectedValue(new Error('not found'));

    await expect(cancelRemindersForActivityLogs(['log-1'])).resolves.toBeUndefined();
  });
});
