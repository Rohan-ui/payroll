import { parseCosecClock, serializeCosecDailyAttendance } from '@/modules/external-api/cosec.serializer';

// Real COSEC attendance-daily row (EMP140, 22/09/2026) with all 12 punch slots populated.
const row = {
  userid: 'EMP140',
  username: 'Rohan Sawant',
  punch1_date: '22/09/2026',
  punch1_time: '08:53:44',
  punch2_time: '09:46:39',
  punch3_time: '09:58:55',
  punch4_time: '11:56:22',
  punch5_time: '11:56:29',
  punch6_time: '12:14:30',
  punch7_time: '12:14:37',
  punch8_time: '13:05:41',
  punch9_time: '13:32:06',
  punch10_time: '17:42:44',
  punch11_time: '17:42:53',
  punch12_time: '18:06:58',
  outpunch_time: '18:06:58',
  firsthalf: 'PR',
  secondhalf: 'PR',
  worktime_hhmm: '08:34',
  shiftstart: '08:00',
  shiftend: '17:00',
  scheduleshift: 'GS',
  workingshift: 'S3',
};

describe('serializeCosecDailyAttendance', () => {
  it('keeps every punch COSEC returns, in punch order', () => {
    const [day] = serializeCosecDailyAttendance([row]);
    expect(day.punches.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(day.punches.map((p) => p.time)).toEqual([
      '08:53:44', '09:46:39', '09:58:55', '11:56:22', '11:56:29', '12:14:30',
      '12:14:37', '13:05:41', '13:32:06', '17:42:44', '17:42:53', '18:06:58',
    ]);
  });

  it('treats an even final punch as the check-out', () => {
    const [day] = serializeCosecDailyAttendance([row]);
    expect(day.isCurrentlyInside).toBe(false);
    expect(day.lastCheckOutTime).toBe('18:06:58');
    expect(day.outPunchMatchedIndex).toBe(12);
    expect(day.workedMinutes).toBe(514);
  });

  it('skips empty slots and is not limited to a fixed punch count', () => {
    const [day] = serializeCosecDailyAttendance([
      { userid: 'E1', punch1_date: '22/09/2026', punch1_time: '09:00:00', punch2_time: '', punch14_time: '19:00:00', punch13_time: '18:00:00' },
    ]);
    expect(day.punches.map((p) => p.index)).toEqual([1, 13, 14]);
  });

  it('reads the scheduled shift from COSEC shift fields, not from punches', () => {
    const [day] = serializeCosecDailyAttendance([row]);
    expect(day).toMatchObject({
      scheduledShiftCode: 'GS',
      workingShiftCode: 'S3',
      shiftStart: '08:00',
      shiftEnd: '17:00',
    });
  });

  it('leaves shift fields null when COSEC omits or garbles them', () => {
    const [day] = serializeCosecDailyAttendance([{ userid: 'E1', punch1_date: '22/09/2026', shiftstart: '25:00' }]);
    expect(day).toMatchObject({ scheduledShiftCode: null, workingShiftCode: null, shiftStart: null, shiftEnd: null });
  });
});

describe('parseCosecClock', () => {
  it.each([
    ['08:00', '08:00'],
    ['23:59:59', '23:59'],
    [' 00:00 ', '00:00'],
    ['24:00', null],
    ['8:00', null],
    ['', null],
    [undefined, null],
  ])('%p → %p', (input, expected) => {
    expect(parseCosecClock(input)).toBe(expected);
  });
});
