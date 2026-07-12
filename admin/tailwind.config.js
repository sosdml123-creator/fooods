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
        brand: {
          green: {
            50: '#f2f8f5',
            100: '#e1efe7',
            500: '#2f5c40',
            700: '#1f3d2b',
            900: '#14261c',
          }
        }
      }
    },
  },
  plugins: [],
}
