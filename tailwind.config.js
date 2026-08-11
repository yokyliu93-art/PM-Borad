/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 0 0 1px rgba(139, 92, 246, 0.22), 0 20px 70px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}
