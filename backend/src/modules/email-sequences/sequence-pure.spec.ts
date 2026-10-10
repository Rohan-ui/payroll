import { classifySendFailure, newMessageId } from './sequence-mail';
import { isAutomatic, isDeliveryReport, readBounce, repliedTo, InboundMessage } from './sequence-inbound';
import { leadValues, renderPlaceholders, unknownPlaceholders } from './sequence-placeholders';
import { ConditionProblem, matchesConditions, parseConditions } from './sequence-rules';
import { earliestSendTime, inWindow, nextDayWindow, SendSchedule, stepDueAt, todayRange } from './sequence-schedule';

const IST = 'Asia/Kolkata';
/** An instant from India wall-clock time. */
const ist = (iso: string) => new Date(`${iso}+05:30`);
const schedule = (extra: Partial<SendSchedule> = {}): SendSchedule => ({
  timeZone: IST, holidays: new Set(['2026-10-02']), weekdays: [1, 2, 3, 4, 5], windowStart: 600, windowEnd: 1020, skipHolidays: true, ...extra,
});
const calendar = { timeZone: IST, holidays: new Set(['2026-10-02']) };

describe('sending schedule', () => {
  it('sends inside the window at once, and otherwise at the next window, in the workspace’s time zone', () => {
    // Wednesday 7 October 2026.
    expect(earliestSendTime(ist('2026-10-07T11:00:00'), schedule())).toEqual(ist('2026-10-07T11:00:00'));
    expect(earliestSendTime(ist('2026-10-07T08:00:00'), schedule())).toEqual(ist('2026-10-07T10:00:00'));
    // 17:00 is the end: the next day, 10:00.
    expect(earliestSendTime(ist('2026-10-07T17:00:00'), schedule())).toEqual(ist('2026-10-08T10:00:00'));
    // Friday evening: Monday morning. Thursday 1 October evening: Friday 2 October is a holiday, so Monday 5 October.
    expect(earliestSendTime(ist('2026-10-09T18:00:00'), schedule())).toEqual(ist('2026-10-12T10:00:00'));
    expect(earliestSendTime(ist('2026-10-01T18:00:00'), schedule())).toEqual(ist('2026-10-05T10:00:00'));
    expect(earliestSendTime(ist('2026-10-01T18:00:00'), schedule({ skipHolidays: false }))).toEqual(ist('2026-10-02T10:00:00'));
    // Another time zone: 09:00 in New York is 18:30 in India.
    expect(earliestSendTime(new Date('2026-10-07T13:00:00Z'), schedule({ timeZone: 'America/New_York' }))).toEqual(new Date('2026-10-07T14:00:00Z'));
    expect(inWindow(ist('2026-10-10T11:00:00'), schedule())).toBe(false);
    expect(earliestSendTime(ist('2026-10-07T11:00:00'), schedule({ weekdays: [] }))).toBeNull();
  });

  it('counts working days without weekends and holidays, or calendar days, then keeps to the window', () => {
    // Thursday 1 October, 12:00, plus 1 working day: Friday is a holiday, so Monday 5 October at 12:00.
    expect(stepDueAt(ist('2026-10-01T12:00:00'), 1, 'WORKING_DAYS', calendar, schedule())).toEqual(ist('2026-10-05T12:00:00'));
    // Plus 2 calendar days: Saturday 3 October, outside the sending days, so Monday 10:00.
    expect(stepDueAt(ist('2026-10-01T12:00:00'), 2, 'CALENDAR_DAYS', calendar, schedule())).toEqual(ist('2026-10-05T10:00:00'));
    expect(stepDueAt(ist('2026-10-07T16:59:00'), 0, 'WORKING_DAYS', calendar, schedule())).toEqual(ist('2026-10-07T16:59:00'));
    expect(nextDayWindow(ist('2026-10-07T11:00:00'), schedule())).toEqual(ist('2026-10-08T10:00:00'));
    expect(todayRange(ist('2026-10-07T23:30:00'), IST)).toEqual({ start: ist('2026-10-07T00:00:00'), end: ist('2026-10-08T00:00:00') });
  });
});

describe('placeholders', () => {
  const lead = { first_name: 'Priya', last_name: null, company_name: 'Acme', designation: null, industry: 'Retail', city: null };
  it('fill in real values, use a fallback when given, and report what is missing instead of guessing', () => {
    const values = leadValues(lead, { owner: 'Ravi', sender: 'Ravi Kumar', workspace: 'Voogyo' });
    expect(renderPlaceholders('Hi {{First Name}} at {{company name}}, {{ Designation | there }}', values)).toEqual({ text: 'Hi Priya at Acme, there', missing: [] });
    expect(renderPlaceholders('Dear {{Last Name}} in {{City}}', values)).toEqual({ text: 'Dear {{Last Name}} in {{City}}', missing: ['Last Name', 'City'] });
    expect(renderPlaceholders('{{Full Name}} / {{Lead Owner}}', values).text).toBe('Priya / Ravi');
    expect(unknownPlaceholders('Hi {{First Name}}, {{company}} and {{Budget|x}}')).toEqual(['company', 'Budget']);
  });
});

describe('enrollment rule conditions', () => {
  it('match all or any condition, without case, and refuse malformed ones', () => {
    const rules = parseConditions({ match: 'ALL', conditions: [{ field: 'industry', operator: 'EQUALS', value: ' retail ' }, { field: 'city', operator: 'IN', value: ['Pune', 'Mumbai'] }] });
    expect(matchesConditions({ industry: 'Retail', city: 'pune' }, rules)).toBe(true);
    expect(matchesConditions({ industry: 'Retail', city: 'Delhi' }, rules)).toBe(false);
    expect(matchesConditions({ industry: 'Retail', city: 'Delhi' }, { ...rules, match: 'ANY' })).toBe(true);
    expect(matchesConditions({ designation: null }, parseConditions({ conditions: [{ field: 'designation', operator: 'IS_EMPTY' }] }))).toBe(true);
    expect(matchesConditions({}, parseConditions({}))).toBe(true);
    expect(() => parseConditions({ conditions: [{ field: 'salary', operator: 'EQUALS', value: '1' }] })).toThrow(ConditionProblem);
    expect(() => parseConditions({ conditions: [{ field: 'city', operator: 'EQUALS', value: ' ' }] })).toThrow('needs a value');
  });
});

describe('send failures', () => {
  it('retry what certainly did not go out, wait for a person on refusals, and never resend what may have gone out', () => {
    expect(classifySendFailure({ code: 'ECONNECTION', command: 'CONN' })).toMatchObject({ kind: 'TRANSIENT' });
    expect(classifySendFailure({ responseCode: 421, command: 'MAIL FROM' })).toMatchObject({ kind: 'TRANSIENT' });
    expect(classifySendFailure({ responseCode: 550, command: 'RCPT TO' })).toMatchObject({ kind: 'PERMANENT', code: 'RECIPIENT_REFUSED' });
    expect(classifySendFailure({ code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535 })).toMatchObject({ kind: 'PERMANENT', code: 'SENDER_SIGN_IN_REFUSED' });
    expect(classifySendFailure({ code: 'ETIMEDOUT', command: 'DATA' })).toMatchObject({ kind: 'UNCERTAIN' });
    expect(classifySendFailure(new Error('socket hang up'))).toMatchObject({ kind: 'UNCERTAIN' });
    // Wrapped: the SMTP details are found on the cause.
    expect(classifySendFailure(Object.assign(new Error('wrapped'), { cause: { code: 'ECONNECTION', command: 'CONN' } }))).toMatchObject({ kind: 'TRANSIENT' });
    expect(newMessageId('sales@acme.test')).toMatch(/^<seq\.[0-9a-f]{32}@acme\.test>$/);
  });
});

describe('replies and bounces', () => {
  const sent = new Set(['<seq.1@acme.test>', '<seq.2@acme.test>']);
  const message = (extra: Partial<InboundMessage>): InboundMessage => ({ messageId: '<in@x>', from: 'priya@client.test', subject: 'Re: Hello', date: new Date(), inReplyTo: null, references: [], headers: '', ...extra });

  it('match a reply by the email it answers, and tell automatic replies apart', () => {
    expect(repliedTo(message({ inReplyTo: '<SEQ.1@acme.test>' }), sent)).toBe('<seq.1@acme.test>');
    expect(repliedTo(message({ references: ['<other@x>', '<seq.2@acme.test>'] }), sent)).toBe('<seq.2@acme.test>');
    expect(repliedTo(message({ inReplyTo: '<unrelated@x>' }), sent)).toBeNull();
    expect(isAutomatic(message({ headers: 'Auto-Submitted: auto-replied\r\n' }))).toBe(true);
    expect(isAutomatic(message({ subject: 'Out of Office: back Monday' }))).toBe(true);
    expect(isAutomatic(message({ headers: 'Auto-Submitted: no\r\n' }))).toBe(false);
  });

  it('read a delivery report for one of our emails, hard or soft', () => {
    const report = (status: string) => message({
      from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', headers: 'Content-Type: multipart/report; report-type=delivery-status\r\n',
      source: `Content-Type: message/delivery-status\r\n\r\nFinal-Recipient: rfc822; gone@client.test\r\nAction: failed\r\nStatus: ${status}\r\n\r\nContent-Type: text/rfc822-headers\r\n\r\nMessage-ID: <seq.2@acme.test>\r\nSubject: Hello\r\n`,
    });
    expect(isDeliveryReport(report('5.1.1'))).toBe(true);
    expect(readBounce(report('5.1.1'), sent)).toEqual({ messageId: '<seq.2@acme.test>', kind: 'HARD', status: '5.1.1' });
    expect(readBounce(report('4.2.2'), sent)?.kind).toBe('SOFT');
    expect(readBounce(report('5.1.1'), new Set(['<seq.9@acme.test>']))).toBeNull();
  });
});
