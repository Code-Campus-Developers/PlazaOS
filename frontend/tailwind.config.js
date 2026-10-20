/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#3730A3', light: '#6366F1', dark: '#2D2680', 50: '#F0F0FF', 100: '#E0E0FF' },
        success: '#16A34A',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#0284C7',
        slate: { 900: '#0F172A', 500: '#64748B', 200: '#E2E8F0', 50: '#F8F9FB', 100: '#F1F2F6' },
        border: {DEFAULT:'#E2E8F0', strong: '#CBD5E1'},
        text: {DEFAULT: '#0F172A', secondary: '#64748B', muted: '#94A3B8'},
        surface: {DEFAULT: '#FFFFFF', elevated: '#F8F9FB', hover: '#F1F2F6'},
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        button: '8px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        md: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
        lg: '0 10px 15px -3px rgba(15, 23, 42, 0.10), 0 4px 8px -4px rgba(15, 23, 42, 0.05)',
        xl: '0 20px 25px -5px rgba(15, 23, 42, 0.10), 0 8px 10px -6px rgba(15, 23, 42, 0.05)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'slide-in': 'slide-in 200ms ease-out',
      },
    },
  },
  plugins: [],
}