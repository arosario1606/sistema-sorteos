/** @type {import('tailwindcss').Config} */
// Mismos tokens que la intranet (ux_ui_identity.md): primary / accent / fuente Inter.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0454AC',
        accent: '#00825A',
      },
      fontFamily: {
        gss: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
