/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Platform HQ semantic tokens; values live in index.css per theme.
        hq: Object.fromEntries(
          [
            'background', 'foreground', 'card', 'card-foreground', 'popover', 'muted', 'muted-foreground',
            'subtle-foreground', 'border', 'input', 'ring', 'accent', 'accent-foreground', 'secondary',
            'secondary-foreground', 'primary', 'primary-hover', 'primary-foreground', 'link', 'destructive',
            'destructive-hover', 'destructive-foreground', 'danger', 'success', 'warning', 'info', 'neutral',
            'overlay', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
          ].map((token) => [token, `rgb(var(--hq-${token}) / <alpha-value>)`]),
        ),
        // Voogyo primary teal (from bottom arrow)
        teal: {
          50:  '#E6F8F6',
          100: '#C7F1ED',
          200: '#96E5DD',
          300: '#5CD4C8',
          400: '#26C2B4',
          500: '#00B8A8',  // Voogyo primary brand teal
          600: '#009E90',
          700: '#007E73',
          800: '#005C55',
          900: '#003B37',
        },
        // Voogyo modern indigo / periwinkle (from top arrow)
        indigo: {
          50:  '#EEF2FC',
          100: '#DCE4F9',
          200: '#BCCCF4',
          300: '#97AFEC',
          400: '#7896E5',
          500: '#5D7CDE',  // Voogyo accent brand indigo
          600: '#4663C4',
          700: '#354CA0',
          800: '#273778',
          900: '#1C2754',
        },
        // Voogyo Dark Obsidian & Charcoal brand tokens
        voogyo: {
          dark:        '#181724',
          'dark-nav':  '#1E1D2D',
          'dark-card': '#252336',
          border:      '#2B293E',
          charcoal:    '#373643',
          teal:        '#00B8A8',
          indigo:      '#5D7CDE',
          surface:     '#F8F9FC',
        },
        // Mint soft fills (teal tints)
        mint: {
          50:  '#F0FAF8',
          100: '#DCF5F1',
          200: '#B9ECE3',
          300: '#96E2D5',
          400: '#73D8C7',
          500: '#00B8A8',
        },
        // Dark Obsidian — sidebar background, header emphasis
        darkGreen: {
          50:  '#EBEBEE',
          100: '#C7C6D0',
          200: '#9E9CAF',
          300: '#74718D',
          400: '#4B476C',
          500: '#26243A',
          600: '#181724',  // Voogyo sidebar bg
          700: '#13121D',
          800: '#0E0D15',
          900: '#09080E',
        },
        'dark-green': {
          50:  '#EBEBEE',
          100: '#C7C6D0',
          200: '#9E9CAF',
          300: '#74718D',
          400: '#4B476C',
          500: '#26243A',
          600: '#181724',  // Voogyo sidebar bg
          700: '#13121D',
          800: '#0E0D15',
          900: '#09080E',
        },
        // App surface background
        surface: '#F8F9FC',
        // Rupee financial indicators
        rupee: {
          green: '#00B8A8',
          amber: '#D97706',
          red:   '#DC2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '20px',
        '4xl': '24px',
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
      boxShadow: {
        'card':       '0 1px 3px 0 rgba(0,0,0,0.07), 0 1px 2px -1px rgba(0,0,0,0.05)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.10), 0 2px 4px -2px rgba(0,0,0,0.06)',
        'sidebar':    '2px 0 8px 0 rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
};
