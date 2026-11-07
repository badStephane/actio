/** @type {import('tailwindcss').Config} */
// Tokens du plan design (docs/squad/02-design-ux.md §2). Les classes Tailwind par défaut restent valides.
// Règles : texte en teintes DEFAULT / ink seulement ; teintes `fill` réservées aux remplissages graphiques.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#EEF4FB', 100: '#D9E6F6', 500: '#4B85CD', 600: '#2563B8', 700: '#1E4F94', 900: '#192A49' },
        ink: { DEFAULT: '#111827', soft: '#374151', muted: '#4B5563' },
        surface: { DEFAULT: '#FFFFFF', app: '#F3F4F6', subtle: '#F9FAFB', line: '#D1D5DB' },
        cash: { DEFAULT: '#047857', fill: '#059669', soft: '#D1FAE5', ink: '#065F46' },
        wave: { DEFAULT: '#0369A1', fill: '#0284C7', soft: '#E0F2FE', ink: '#075985' },
        om: { DEFAULT: '#C2410C', fill: '#EA580C', soft: '#FFEDD5', ink: '#9A3412' },
        danger: { DEFAULT: '#B91C1C', soft: '#FEF2F2', line: '#FCA5A5' },
        warning: { DEFAULT: '#92400E', soft: '#FFFBEB', line: '#FCD34D' },
        success: { DEFAULT: '#065F46', soft: '#ECFDF5', line: '#6EE7B7' },
      },
      borderRadius: { control: '6px', card: '8px' },
      boxShadow: {
        card: '0 1px 2px 0 rgb(17 24 39 / 0.06)',
        pop: '0 10px 30px -5px rgb(17 24 39 / 0.25)',
      },
      height: { control: '2.25rem', 'control-lg': '2.75rem' },
      minHeight: { control: '2.25rem', 'control-lg': '2.75rem' },
      transitionDuration: { fast: '120ms', base: '200ms' },
    },
  },
  plugins: [],
};
