/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'monospace'],
        display: ['"Fraunces"', 'serif'],
      },
      colors: {
        paper:  '#faf7f2',
        ink:    '#1c1612',
        ink2:   '#6b5e4a',
        rule:   '#ddd5c4',
        sand:   '#f0ebe0',
        ember:  '#c8410a',
        forest: '#2a6e4a',
        ocean:  '#1a4a7a',
        amber:  '#e8c84a',
      },
      keyframes: {
        blink: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.2 } },
        popin: { from: { transform: 'scale(0.8)', opacity: 0 }, to: { transform: 'scale(1)', opacity: 1 } },
        flash: { '0%': { opacity: 0.8 }, '100%': { opacity: 0 } },
        scanline: { '0%': { top: '0%' }, '100%': { top: '100%' } },
      },
      animation: {
        blink:   'blink 1s infinite',
        popin:   'popin 0.2s cubic-bezier(.34,1.56,.64,1)',
        flash:   'flash 0.15s ease-out forwards',
        scanline:'scanline 2s linear infinite',
      },
    },
  },
  plugins: [],
}
