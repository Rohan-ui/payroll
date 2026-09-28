// Platform HQ: apply the saved theme before first paint so there is no flash.
// Kept outside the bundle because the Content-Security-Policy forbids inline scripts.
// The same rules live in src/superadmin/theme/PlatformThemeContext.tsx.
(function () {
  var theme = 'dark';
  try {
    var saved = window.localStorage.getItem('voogyo_platform_theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = saved === 'light' || saved === 'dark' ? saved : prefersDark ? 'dark' : 'light';
  } catch (error) {
    // Storage or media queries unavailable: keep the default.
  }
  document.documentElement.setAttribute('data-hq-theme', theme);
})();
