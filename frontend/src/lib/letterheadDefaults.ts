// Default corporate letterhead banners for RND Technosoft / VOOGYO CRM
// Used when printing Quotation PDFs or when user selects default letterhead

export const DEFAULT_HEADER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 180" width="100%" height="100%">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
  </defs>
  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="6" fill="url(#headerGrad)" />
  
  <!-- Logo Emblem -->
  <rect x="40" y="30" width="60" height="60" rx="14" fill="#2563eb" />
  <path d="M 55 45 L 70 75 L 85 45 Z" fill="#ffffff" />
  
  <!-- Company Title -->
  <text x="116" y="56" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="900" fill="#0f172a" letter-spacing="-0.5">RND TECHNOSOFT</text>
  <text x="118" y="78" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#64748b" letter-spacing="1.5">ENTERPRISE IT SOLUTIONS &amp; CLOUD ARCHITECTURE</text>
  
  <!-- Right Column Contact & Address -->
  <text x="1160" y="44" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="500" fill="#475569">Titanium City Centre, Satellite, Ahmedabad, GJ — 380015</text>
  <text x="1160" y="64" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#2563eb">contact@rndtechnosoft.in  |  +91 79 4000 1234  |  www.rndtechnosoft.in</text>
  <text x="1160" y="84" text-anchor="end" font-family="Courier, monospace" font-size="11" font-weight="600" fill="#64748b">GSTIN: 24ABCDE1234F1Z5  |  PAN: ABCDE1234F</text>
  
  <!-- Bottom separator -->
  <line x1="40" y1="110" x2="1160" y2="110" stroke="#e2e8f0" stroke-width="1.5" />
</svg>
`)}`;

export const DEFAULT_FOOTER_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 90" width="100%" height="100%">
  <defs>
    <linearGradient id="footerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#cbd5e1" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
  </defs>
  <!-- Top line -->
  <rect x="40" y="10" width="1120" height="2" fill="url(#footerGrad)" />
  
  <!-- Legal & CIN / GSTIN Details -->
  <text x="600" y="36" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#334155">
    RND TECHNOSOFT PRIVATE LIMITED  •  CIN: U72200GJ2015PTC083921  •  GSTIN: 24ABCDE1234F1Z5
  </text>
  <text x="600" y="54" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="10" font-weight="500" fill="#64748b">
    Registered Office: B-402, Titanium City Centre, Anandnagar Road, Satellite, Ahmedabad, Gujarat — 380015, India
  </text>
  <text x="600" y="70" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9" font-weight="500" fill="#94a3b8">
    Confidential Commercial Document  •  Generated electronically via VOOGYO CRM  •  Official Signature &amp; Stamp Required for Contractual Validity
  </text>
</svg>
`)}`;
