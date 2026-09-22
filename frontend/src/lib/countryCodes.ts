// Master country codes taxonomy for Voogyo CRM

export interface CountryCodeItem {
  name: string;
  code: string;       // e.g. '+91'
  iso: string;        // e.g. 'IN'
  flag: string;       // e.g. '🇮🇳'
  priority?: number;  // lower number = higher priority
}

export const COUNTRY_CODES: CountryCodeItem[] = [
  // High Priority (South Asia, Middle East, Key Global B2B markets)
  { name: 'India', code: '+91', iso: 'IN', flag: '🇮🇳', priority: 1 },
  { name: 'United States', code: '+1', iso: 'US', flag: '🇺🇸', priority: 2 },
  { name: 'United Kingdom', code: '+44', iso: 'GB', flag: '🇬🇧', priority: 3 },
  { name: 'United Arab Emirates', code: '+971', iso: 'AE', flag: '🇦🇪', priority: 4 },
  { name: 'Saudi Arabia', code: '+966', iso: 'SA', flag: '🇸🇦', priority: 5 },
  { name: 'Singapore', code: '+65', iso: 'SG', flag: '🇸🇬', priority: 6 },
  { name: 'Canada', code: '+1', iso: 'CA', flag: '🇨🇦', priority: 7 },
  { name: 'Australia', code: '+61', iso: 'AU', flag: '🇦🇺', priority: 8 },
  { name: 'Germany', code: '+49', iso: 'DE', flag: '🇩🇪', priority: 9 },
  { name: 'Qatar', code: '+974', iso: 'QA', flag: '🇶🇦', priority: 10 },
  { name: 'Kuwait', code: '+965', iso: 'KW', flag: '🇰🇼', priority: 11 },
  { name: 'Oman', code: '+968', iso: 'OM', flag: '🇴🇲', priority: 12 },
  { name: 'Bahrain', code: '+973', iso: 'BH', flag: '🇧🇭', priority: 13 },
  
  // Other Asia / Pacific
  { name: 'Bangladesh', code: '+880', iso: 'BD', flag: '🇧🇩' },
  { name: 'Nepal', code: '+977', iso: 'NP', flag: '🇳🇵' },
  { name: 'Sri Lanka', code: '+94', iso: 'LK', flag: '🇱🇰' },
  { name: 'Malaysia', code: '+60', iso: 'MY', flag: '🇲🇾' },
  { name: 'Indonesia', code: '+62', iso: 'ID', flag: '🇮🇩' },
  { name: 'Thailand', code: '+66', iso: 'TH', flag: '🇹🇭' },
  { name: 'Philippines', code: '+63', iso: 'PH', flag: '🇵🇭' },
  { name: 'Vietnam', code: '+84', iso: 'VN', flag: '🇻🇳' },
  { name: 'Japan', code: '+81', iso: 'JP', flag: '🇯🇵' },
  { name: 'China', code: '+86', iso: 'CN', flag: '🇨🇳' },
  { name: 'Hong Kong', code: '+852', iso: 'HK', flag: '🇭🇰' },
  { name: 'New Zealand', code: '+64', iso: 'NZ', flag: '🇳🇿' },

  // Europe
  { name: 'France', code: '+33', iso: 'FR', flag: '🇫🇷' },
  { name: 'Italy', code: '+39', iso: 'IT', flag: '🇮🇹' },
  { name: 'Spain', code: '+34', iso: 'ES', flag: '🇪🇸' },
  { name: 'Netherlands', code: '+31', iso: 'NL', flag: '🇳🇱' },
  { name: 'Switzerland', code: '+41', iso: 'CH', flag: '🇨🇭' },
  { name: 'Sweden', code: '+46', iso: 'SE', flag: '🇸🇪' },
  { name: 'Ireland', code: '+353', iso: 'IE', flag: '🇮🇪' },
  { name: 'Belgium', code: '+32', iso: 'BE', flag: '🇧🇪' },
  { name: 'Poland', code: '+48', iso: 'PL', flag: '🇵🇱' },
  { name: 'Turkey', code: '+90', iso: 'TR', flag: '🇹🇷' },

  // Americas & Africa
  { name: 'Brazil', code: '+55', iso: 'BR', flag: '🇧🇷' },
  { name: 'Mexico', code: '+52', iso: 'MX', flag: '🇲🇽' },
  { name: 'South Africa', code: '+27', iso: 'ZA', flag: '🇿🇦' },
  { name: 'Nigeria', code: '+234', iso: 'NG', flag: '🇳🇬' },
  { name: 'Kenya', code: '+254', iso: 'KE', flag: '🇰🇪' },
  { name: 'Egypt', code: '+20', iso: 'EG', flag: '🇪🇬' },
  { name: 'Pakistan', code: '+92', iso: 'PK', flag: '🇵🇰' }
];

// Sort country codes by priority, then by name
export const SORTED_COUNTRY_CODES = [...COUNTRY_CODES].sort((a, b) => {
  const pA = a.priority ?? 99;
  const pB = b.priority ?? 99;
  if (pA !== pB) return pA - pB;
  return a.name.localeCompare(b.name);
});

/**
 * Parses a combined phone number string into separate countryCode and nationalNumber
 * Example: '+91 98250 12345' -> { countryCode: '+91', number: '98250 12345' }
 * Example: '9825012345' (no code) -> { countryCode: '+91', number: '9825012345' }
 */
export function parsePhoneWithCountryCode(
  rawPhone?: string | null, 
  defaultCountryCode = '+91'
): { countryCode: string; number: string; countryItem?: CountryCodeItem } {
  if (!rawPhone || !rawPhone.trim()) {
    const defaultItem = COUNTRY_CODES.find(c => c.code === defaultCountryCode) || COUNTRY_CODES[0];
    return { countryCode: defaultCountryCode, number: '', countryItem: defaultItem };
  }

  const cleaned = rawPhone.trim();

  // If string starts with '+', search for matching code
  if (cleaned.startsWith('+')) {
    // Sort codes by length descending so +971 matches before +9
    const sortedByLen = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
    for (const item of sortedByLen) {
      if (cleaned.startsWith(item.code)) {
        const numberPart = cleaned.slice(item.code.length).trim().replace(/^[-.\s]+/, '');
        return {
          countryCode: item.code,
          number: numberPart,
          countryItem: item
        };
      }
    }
  }

  // Check if string starts with standard 00 international prefix
  if (cleaned.startsWith('00')) {
    const withPlus = '+' + cleaned.slice(2);
    return parsePhoneWithCountryCode(withPlus, defaultCountryCode);
  }

  // If no prefix, assume default country code
  const defaultItem = COUNTRY_CODES.find(c => c.code === defaultCountryCode) || COUNTRY_CODES[0];
  return {
    countryCode: defaultCountryCode,
    number: cleaned,
    countryItem: defaultItem
  };
}

/**
 * Combines a country code and national number into a clean full phone string
 */
export function combinePhoneWithCountryCode(countryCode: string, number: string): string {
  const trimmedCode = countryCode.trim();
  const trimmedNumber = number.trim();

  if (!trimmedNumber) return '';
  if (!trimmedCode) return trimmedNumber;

  const cleanCode = trimmedCode.startsWith('+') ? trimmedCode : `+${trimmedCode}`;
  return `${cleanCode} ${trimmedNumber}`;
}

/**
 * Extracts dial code (+91, +1, etc.) from standard format like '+91 (🇮🇳 India)' or '+91'
 */
export function extractDialCode(rawCode?: string | null, fallback = '+91'): string {
  if (!rawCode) return fallback;
  const match = rawCode.match(/\+\d+/);
  if (match) return match[0];
  const digitsOnly = rawCode.replace(/[^0-9]/g, '');
  if (digitsOnly) return `+${digitsOnly}`;
  return fallback;
}

/**
 * Clean digits for WhatsApp links (e.g. wa.me/919825012345)
 */
export function formatWhatsAppDigits(rawPhone?: string | null, defaultCode = '+91'): string {
  if (!rawPhone) return '';
  const parsed = parsePhoneWithCountryCode(rawPhone, defaultCode);
  const codeDigits = parsed.countryCode.replace(/[^0-9]/g, '');
  const numDigits = parsed.number.replace(/[^0-9]/g, '');
  return `${codeDigits}${numDigits}`;
}

