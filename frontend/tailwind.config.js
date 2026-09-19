/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TeamHub primary teal
        teal: {
          50:  '#E6F7F2',
          100: '#CCEFE5',
          200: '#99DFC9',
          300: '#66CFAD',
          400: '#33BF91',
          500: '#2FB898',  // primary brand
          600: '#25927A',
          700: '#1A6D5B',
          800: '#10493D',
          900: '#07241E',
        },
        // Mint soft fills
        mint: {
          50:  '#F2FAF4',
          100: '#E6F4DC',  // card highlights, soft fills
          200: '#C7E8B9',
          300: '#A8DC96',
          400: '#89D073',
          500: '#6AC450',
        },
        // Dark green — sidebar background, emphasis
        darkGreen: {
          50:  '#E7F2EE',
          100: '#B9D8CE',
          200: '#8BBEAD',
          300: '#5CA48C',
          400: '#2E8A6B',
          500: '#0E6E53',
          600: '#0E5A47',  // sidebar bg
          700: '#0A4537',
          800: '#073027',
          900: '#031B17',
        },
        'dark-green': {
          50:  '#E7F2EE',
          100: '#B9D8CE',
          200: '#8BBEAD',
          300: '#5CA48C',
          400: '#2E8A6B',
          500: '#0E6E53',
          600: '#0E5A47',  // sidebar bg
          700: '#0A4537',
          800: '#073027',
          900: '#031B17',
        },
        // App surface background
        surface: '#F4F5F4',
        // Rupee financial indicators
        rupee: {
          green: '#15803D',
          amber: '#B45309',
          red:   '#B91C1C',
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
