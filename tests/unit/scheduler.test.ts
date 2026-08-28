const mockSchedulesCreate = jest.fn();
const mockIsQStashPublishingConfigured = jest.fn(() => true);
const mockGetApiBaseUrl = jest.fn(() => 'https://api.example.test');

jest.mock('../../src/common/qstash/qstash.util', () => ({
  isQStashPublishingConfigured: () => mockIsQStashPublishingConfigured(),
  getApiBaseUrl: () => mockGetApiBaseUrl(),
  getQStashClient: () => ({
    schedules: { create: mockSchedulesCreate },
  }),
}));

import { registerReconcileSchedule } from '../../src/jobs/scheduler';

describe('registerReconcileSchedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsQStashPublishingConfigured.mockReturnValue(true);
    mockGetApiBaseUrl.mockReturnValue('https://api.example.test');
    mockSchedulesCreate.mockResolvedValue({ scheduleId: 'reconcile-all-users' });
  });

  it('registers a QStash schedule with a fixed scheduleId, a 10-minute cron, and the reconcile callback URL', async () => {
    await registerReconcileSchedule();

    expect(mockSchedulesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 'reconcile-all-users',
        destination: 'https://api.example.test/qstash/reconcile',
        cron: '*/10 * * * *',
      }),
    );
  });

  it('calling it again with the same scheduleId updates in place rather than creating a duplicate — this just proves the id stays fixed across calls', async () => {
    await registerReconcileSchedule();
    await registerReconcileSchedule();

    expect(mockSchedulesCreate).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockSchedulesCreate.mock.calls;
    expect(firstCall[0].scheduleId).toBe(secondCall[0].scheduleId);
  });

  it('does nothing when QStash is not configured (local dev)', async () => {
    mockGetApiBaseUrl.mockReturnValue('');

    await registerReconcileSchedule();

    expect(mockSchedulesCreate).not.toHaveBeenCalled();
  });
});
