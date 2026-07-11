/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cream:      '#FAF6F0',
        deep:       '#1A1210',
        terracotta: '#C96A3A',
        blush:      '#F0D4BE',
        sage:       '#7A9E7E',
        gold:       '#D4A853',
        charcoal:   '#2D2420',
        warm:       '#8A7E78',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body:    ['"DM Sans"', 'sans-serif'],
      },
      boxShadow: {
        card:       '0 4px 24px rgba(26,18,16,0.08)',
        'card-hover':'0 12px 48px rgba(26,18,16,0.14)',
        glow:       '0 8px 32px rgba(201,106,58,0.3)',
      },
    },
  },
  plugins: [],
}
