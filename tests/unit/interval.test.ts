import { timeRangesOverlap } from '../../src/common/utils/interval';

describe('timeRangesOverlap', () => {
  it('detects simple overlap', () => {
    expect(timeRangesOverlap('09:00', '10:00', '09:30', '10:30')).toBe(true);
  });

  it('detects no overlap for disjoint ranges', () => {
    expect(timeRangesOverlap('09:00', '10:00', '10:00', '11:00')).toBe(false);
  });

  it('detects overlap for a midnight-crossing range against a late-night range', () => {
    // 23:30 -> 00:30 crosses midnight; 23:45 -> 00:15 also crosses midnight and overlaps.
    expect(timeRangesOverlap('23:30', '00:30', '23:45', '00:15')).toBe(true);
  });

  it('does not falsely overlap a midnight-crossing range against an unrelated morning range', () => {
    expect(timeRangesOverlap('23:30', '00:30', '06:00', '07:00')).toBe(false);
  });

  it('detects overlap between a midnight-crossing range and an early-morning range it spills into', () => {
    // 23:30 -> 00:30 occupies 00:00-00:30 the next morning; 00:15-00:45 should overlap.
    expect(timeRangesOverlap('23:30', '00:30', '00:15', '00:45')).toBe(true);
  });
});
