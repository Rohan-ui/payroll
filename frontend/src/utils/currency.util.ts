/**
 * Formats a number into Indian Rupee format (Lakhs and Crores).
 * Example: 125000 -> ₹1,25,000
 */
export function formatINR(amount: number | string | null | undefined, showDecimals = false): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '₹0';
  }
  const numericAmount = Number(amount);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(numericAmount);
}

/**
 * Converts numbers to Indian numbering word format for formal payslip printing.
 * Example: 125000 -> "One Lakh Twenty-Five Thousand Rupees Only"
 */
export function numberToWordsINR(num: number): string {
  if (!num || num === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return teens[n - 10];
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + singleDigits[n % 10] : '');
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let result = '';
    if (hundred > 0) {
      result += singleDigits[hundred] + ' Hundred';
      if (rest > 0) result += ' and ';
    }
    if (rest > 0) {
      result += convertTwoDigits(rest);
    }
    return result;
  }

  let integerPart = Math.floor(Math.abs(num));
  let words = '';

  // Crores (>= 1,00,00,000)
  const crore = Math.floor(integerPart / 10000000);
  integerPart %= 10000000;
  if (crore > 0) {
    words += convertTwoDigits(crore) + ' Crore ';
  }

  // Lakhs (>= 1,00,000)
  const lakh = Math.floor(integerPart / 100000);
  integerPart %= 100000;
  if (lakh > 0) {
    words += convertTwoDigits(lakh) + ' Lakh ';
  }

  // Thousands (>= 1,000)
  const thousand = Math.floor(integerPart / 1000);
  integerPart %= 1000;
  if (thousand > 0) {
    words += convertTwoDigits(thousand) + ' Thousand ';
  }

  // Hundreds
  if (integerPart > 0) {
    words += convertThreeDigits(integerPart);
  }

  return words.trim() + ' Rupees Only';
}

/**
 * Format date in Indian business format: "05 Oct 2026"
 */
export function formatDateIndian(dateStr: string | Date): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
