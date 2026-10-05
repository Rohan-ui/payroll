import { parseBudget, resolveCountry } from './crm-lead-import.service';

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
});
