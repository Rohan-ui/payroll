import { generateWhatsAppUrl } from './crm-cadence.helper';
import { LINKEDIN_INVALID, normalizeLinkedInUrl, WHATSAPP_NUMBER_INVALID, WHATSAPP_NUMBER_MISSING, whatsAppChatUrl, whatsAppDigits } from './outreach-channels';

/** The message WhatsApp reads back from the link: the text parameter, decoded as a browser decodes it. */
const sentText = (url: string) => new URL(url).searchParams.get('text');

const MESSAGES = [
  'Hello 👋',
  "Let's connect 🚀",
  'Thank you 😊🙏',
  '₹12,50,000',
  'नमस्ते 👋',
  'ગુજરાતી 🚀',
  'Hello 👋\nLet\'s connect 🚀\n\n₹12,50,000',
  '😀 😂 😊 👍 👋 ❤️ 🔥 🚀',
  '❤️ ♥️ ☑️ ™️ ©️ ®️',
  '👍🏻 👍🏽 👍🏿',
  '👨‍💻 👩‍💼 🤝',
  '🇮🇳 🇺🇸',
  'नमस्ते ગુજરાતી हिंदी 中文 日本語',
  "Hello Rajesh 👋\n\nWe'd love to discuss how Voogyo can help your team 🚀\n\nLet's connect this week. 😊\n\nधन्यवाद 🙏",
  'Rates & terms? 100% sure + "quoted" — #1 choice… it\'s “great” – a=b&c=d',
  '• Point one\n• Point two\n\tTabbed',
  'Long message 🚀 '.repeat(300),
];

describe('WhatsApp links', () => {
  it.each(MESSAGES.map((m) => [m.slice(0, 30), m]))('carry "%s" exactly as written', (_label, message) => {
    const url = whatsAppChatUrl('919825012345', message);
    expect(url.startsWith('https://api.whatsapp.com/send?')).toBe(true);
    expect(sentText(url)).toBe(message);
    // Encoded once: no raw spaces, newlines or emoji left in the address, and no replacement characters.
    expect(url).not.toMatch(/[\s\u0080-￿]/);
    expect(decodeURIComponent(url)).not.toContain('�');
    expect(new URL(url).searchParams.get('phone')).toBe('919825012345');
  });

  it('send emoji as their UTF-8 bytes, not wa.me (whose redirect turns them into "?")', () => {
    const url = whatsAppChatUrl('919825012345', 'Hi 👋');
    expect(url).toBe('https://api.whatsapp.com/send?phone=919825012345&text=Hi+%F0%9F%91%8B');
    expect(url).not.toContain('wa.me');
    expect(url).not.toContain('%EF%BF%BD');
  });

  it('keep the phone rule: digits only, India’s code added to a 10-digit number', () => {
    expect(whatsAppDigits('+91 98250 12345')).toEqual({ digits: '919825012345' });
    expect(whatsAppDigits('(982) 501-2345')).toEqual({ digits: '919825012345' });
    expect(whatsAppDigits('+1 (415) 555-0100')).toEqual({ digits: '14155550100' });
    expect(whatsAppDigits('')).toEqual({ problem: WHATSAPP_NUMBER_MISSING });
    expect(whatsAppDigits(null)).toEqual({ problem: WHATSAPP_NUMBER_MISSING });
    expect(whatsAppDigits('12345')).toEqual({ problem: WHATSAPP_NUMBER_INVALID });
    expect(whatsAppDigits('1234567890123456')).toEqual({ problem: WHATSAPP_NUMBER_INVALID });
    expect(sentText(generateWhatsAppUrl('98250 12345', 'धन्यवाद 🙏'))).toBe('धन्यवाद 🙏');
    expect(generateWhatsAppUrl('abc', 'x')).toBe('');
  });
});

describe('LinkedIn addresses', () => {
  it.each([
    ['https://www.linkedin.com/in/rajesh-sharma/', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['https://linkedin.com/in/rajesh-sharma/', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['linkedin.com/in/rajesh-sharma', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['www.linkedin.com/in/rajesh-sharma/', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['http://in.linkedin.com/in/rajesh-sharma?originalSubdomain=in&utm_source=share', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['  https://WWW.LinkedIn.com/in/rajesh-sharma/recent-activity/  ', 'https://www.linkedin.com/in/rajesh-sharma/', 'PROFILE'],
    ['https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/?trk=x', 'https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/', 'CONVERSATION'],
    ['https://www.linkedin.com/company/apex-heavy/?viewAsMember=true&trk=abc', 'https://www.linkedin.com/company/apex-heavy/?viewAsMember=true', 'PAGE'],
  ])('%s → %s', (raw, url, kind) => {
    expect(normalizeLinkedInUrl(raw)).toEqual({ url, kind });
  });

  it.each([
    'https://www.linkedin.com/',
    'linkedin.com',
    'https://evil.example/in/rajesh',
    'https://linkedin.com.evil.example/in/rajesh',
    'https://evil-linkedin.com/in/rajesh',
    'javascript:alert(1)//linkedin.com/in/x',
    'ftp://linkedin.com/in/x',
    'https://user:pass@linkedin.com/in/x',
    'https://linkedin.com:8443/in/x',
    'Rajesh Sharma',
    '',
    null,
  ])('refuses %s', (raw) => {
    expect(normalizeLinkedInUrl(raw as string | null)).toBeNull();
  });

  it('names the problem the same way everywhere', () => {
    expect(LINKEDIN_INVALID).toBe('Invalid LinkedIn profile URL.');
  });
});
