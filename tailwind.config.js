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
