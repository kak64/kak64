/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ערכת צבעים ראשית של +family (Dark Mode)
        base: '#0b0b16',
        surface: '#13162c',
      },
      fontFamily: {
        sans: ['Heebo', 'Assistant', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 16px rgba(99,102,241,0.35)' },
          '50%': { boxShadow: '0 0 28px rgba(99,102,241,0.65)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
