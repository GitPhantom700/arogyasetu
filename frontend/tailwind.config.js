/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        clinical: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        emergency: {
          critical: '#dc2626',
          'critical-bg': 'rgba(220, 38, 38, 0.12)',
          warning: '#d97706',
          'warning-bg': 'rgba(217, 119, 6, 0.12)',
          adequate: '#16a34a',
          'adequate-bg': 'rgba(22, 163, 74, 0.12)',
        },
        brand: {
          navy: '#0f172a',
          slate: '#1e293b',
          'dark-surface': '#0b1120',
          'dark-card': '#151f32',
          'dark-border': '#22324f',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Outfit', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 10px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.35)',
        'glow-critical': '0 0 20px rgba(220, 38, 38, 0.35)',
      }
    },
  },
  plugins: [],
}
