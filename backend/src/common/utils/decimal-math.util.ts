import { Prisma } from '@prisma/client';

export class DecimalMath {
  private static readonly CURRENCY_SCALE = 2;
  private static readonly RATE_SCALE = 4;
  private static readonly ROUNDING_MODE = Prisma.Decimal.ROUND_HALF_UP;

  /**
   * Convert any valid monetary input (string, number, Decimal) to Prisma.Decimal
   */
  static toDecimal(value: string | number | Prisma.Decimal | null | undefined, defaultValue = '0'): Prisma.Decimal {
    if (value === null || value === undefined) {
      return new Prisma.Decimal(defaultValue);
    }
    if (value instanceof Prisma.Decimal) {
      return value;
    }
    return new Prisma.Decimal(value);
  }

  /**
   * Safe addition: a + b
   */
  static add(a: Prisma.Decimal | string | number, b: Prisma.Decimal | string | number): Prisma.Decimal {
    return this.toDecimal(a).plus(this.toDecimal(b));
  }

  /**
   * Safe subtraction: a - b
   */
  static sub(a: Prisma.Decimal | string | number, b: Prisma.Decimal | string | number): Prisma.Decimal {
    return this.toDecimal(a).minus(this.toDecimal(b));
  }

  /**
   * Safe multiplication: a * b
   */
  static mul(a: Prisma.Decimal | string | number, b: Prisma.Decimal | string | number): Prisma.Decimal {
    return this.toDecimal(a).times(this.toDecimal(b));
  }

  /**
   * Safe division: a / b with zero-check
   */
  static div(a: Prisma.Decimal | string | number, b: Prisma.Decimal | string | number): Prisma.Decimal {
    const divisor = this.toDecimal(b);
    if (divisor.isZero()) {
      throw new Error('Decimal division by zero is not permitted');
    }
    return this.toDecimal(a).dividedBy(divisor);
  }

  /**
   * Round to standard currency scale (2 decimal places) using ROUND_HALF_UP
   */
  static roundCurrency(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return this.toDecimal(value).toDecimalPlaces(this.CURRENCY_SCALE, this.ROUNDING_MODE);
  }

  /**
   * Round to rate/percentage scale (4 decimal places) using ROUND_HALF_UP
   */
  static roundRate(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return this.toDecimal(value).toDecimalPlaces(this.RATE_SCALE, this.ROUNDING_MODE);
  }

  /**
   * Calculate pro-rata amount based on payable days vs total period days:
   * (amount * payableDays) / totalDays, rounded to currency scale
   */
  static calculateProRata(
    amount: Prisma.Decimal | string | number,
    payableDays: Prisma.Decimal | string | number,
    totalDays: Prisma.Decimal | string | number,
  ): Prisma.Decimal {
    const total = this.toDecimal(totalDays);
    if (total.isZero()) {
      return new Prisma.Decimal(0);
    }
    const baseAmount = this.toDecimal(amount);
    const days = this.toDecimal(payableDays);

    // If payable days equals total days, return original amount directly to avoid fractional rounding drift
    if (days.equals(total)) {
      return this.roundCurrency(baseAmount);
    }

    return this.roundCurrency(baseAmount.times(days).dividedBy(total));
  }

  /**
   * Percentage calculation: (base * percentage) / 100
   */
  static percentageOf(
    base: Prisma.Decimal | string | number,
    percentage: Prisma.Decimal | string | number,
  ): Prisma.Decimal {
    return this.roundCurrency(
      this.toDecimal(base).times(this.toDecimal(percentage)).dividedBy(100),
    );
  }

  /**
   * Check if a Decimal is positive or zero
   */
  static isNonNegative(value: Prisma.Decimal | string | number): boolean {
    return !this.toDecimal(value).isNegative();
  }
}
