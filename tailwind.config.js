/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0a0a0f',
          surface: '#111118',
          panel: '#16161f',
          border: '#1e1e2e',
          accent: '#7c6af7',
          'accent-dim': '#4d3fa3',
          gold: '#c9a84c',
          'gold-dim': '#7a621e',
          muted: '#3a3a52',
          text: '#e2e2f0',
          'text-dim': '#8888a8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'beat-flash': 'beatFlash 0.12s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        beatFlash: {
          '0%': { opacity: '1', transform: 'scale(1.08)' },
          '100%': { opacity: '0.6', transform: 'scale(1)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
