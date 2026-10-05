import { parseBudget, parsePhones, resolveCountry } from './crm-lead-import.service';

describe('lead import value parsing', () => {
  it.each([
    ['IN', 'IN'],
    ['india', 'IN'],
    ['+91 (🇮🇳 India)', 'IN'],
    ['+971', 'AE'],
    ['971', 'AE'],
    ['United  Arab Emirates', 'AE'],
    ['+1', 'US'],
  ])('reads the country %s as %s', (raw, iso) => {
    expect(resolveCountry(raw)?.iso).toBe(iso);
  });

  it.each(['', 'Narnia', '+99999'])('does not guess a country for %j', (raw) => {
    expect(resolveCountry(raw)).toBeNull();
  });

  it.each([
    ['150000', '150000'],
    ['1,50,000', '150000'],
    ['₹ 2,500.50', '2500.50'],
    ['INR 9000', '9000'],
    ['Rs. 750', '750'],
  ])('reads the budget %s exactly as %s', (raw, amount) => {
    expect(parseBudget(raw)).toBe(amount);
  });

  it.each(['about 2 lakh', '-500', '12.345', '1e6', '₹'])('refuses the budget %j', (raw) => {
    expect(parseBudget(raw)).toBeNull();
  });

  it.each([
    ['98250 12345', '+91', ['+91 9825012345'], ''],
    ['919825012345', '+91', ['+91 9825012345'], ''],
    ['+91 98250-12345', '+91', ['+91 9825012345'], ''],
    ['0091 98250 12345', '+91', ['+91 9825012345'], ''],
    ['097277 06665', '+91', ['+91 9727706665'], ''],
    ['079 2650 1234', '+91', ['+91 7926501234'], ''],
    ['9123456789', '+91', ['+91 9123456789'], ''],
    ['075758 06470  / 075758 06471', '+91', ['+91 7575806470', '+91 7575806471'], ''],
    ['9825012345(Apar Umargam)/', '+91', ['+91 9825012345'], 'Apar Umargam'],
    ['501234567', '+971', ['+971 501234567'], ''],
    ['+1 212 555 0100', '+91', ['+12125550100'], ''],
    ['No wp', '+91', [], 'No wp'],
  ])('reads the phone cell %j (country %s)', (raw, dial, numbers, extraText) => {
    expect(parsePhones(raw, dial)).toEqual({ numbers, extraText });
  });
});
