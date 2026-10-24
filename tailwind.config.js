/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream:      '#F7F4ED',
        deep:       '#17211B',
        terracotta: '#C85F2D',
        'terracotta-dark': '#A8441D',
        blush:      '#F0D4BE',
        sage:       '#7A9E7E',
        gold:       '#D4A853',
        charcoal:   '#1F2B24',
        warm:       '#647068',
        forest:     '#234C3A',
        'forest-dark': '#173428',
        'forest-pale': '#E6EEE9',
        sun:        '#F3C96A',
        'cream-deep': '#EEE9DE',
        'orange-pale': '#FAE9DF',
        line:       '#DEDDD6',
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body:    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'rise-in':     { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'slide-in':    { '0%': { opacity: '0', transform: 'translateX(-14px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        'pop':         { '0%': { transform: 'scale(0.4)', opacity: '0' }, '70%': { transform: 'scale(1.15)', opacity: '1' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'popover-in':  { '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.98)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
        'slow-zoom':   { '0%': { transform: 'scale(1)' }, '100%': { transform: 'scale(1.08)' } },
        'drift':       { '0%, 100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(2%, -3%, 0)' } },
      },
      animation: {
        'rise-in':    'rise-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'slide-in':   'slide-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop':        'pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'popover-in': 'popover-in 0.22s ease-out both',
        'slow-zoom':  'slow-zoom 22s ease-in-out infinite alternate',
        'drift':      'drift 14s ease-in-out infinite',
      },
      boxShadow: {
        card:       '0 4px 24px rgba(23,33,27,0.08)',
        'card-hover':'0 12px 48px rgba(23,33,27,0.14)',
        glow:       '0 8px 32px rgba(200,95,45,0.3)',
        soft:       '0 24px 70px rgba(23,33,27,0.12)',
      },
    },
  },
  plugins: [],
}
