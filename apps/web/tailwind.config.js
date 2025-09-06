/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html','./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        card: '#111418',
        'card-foreground': '#e6e6e7',
        background: '#0b0b0d',
      }
    }
  },
  plugins: []
}
