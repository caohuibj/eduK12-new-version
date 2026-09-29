/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy primary is retained for protected cognitive stimuli.
        action: {
          DEFAULT: 'rgb(var(--hui-ds-color-action-rgb) / <alpha-value>)',
          light: 'var(--hui-ds-color-soft)',
          dark: 'var(--hui-ds-color-action-hover)',
          hover: 'var(--hui-ds-color-action-hover)',
        },
        primary: {
          DEFAULT: '#1890FF',
          light: '#40A9FF',
          dark: '#096DD9',
        },
        success: '#52C41A',
        warning: '#FAAD14',
        error: '#FF4D4F',
        background: '#F0F2F5',
      },
    },
  },
  plugins: [],
}
