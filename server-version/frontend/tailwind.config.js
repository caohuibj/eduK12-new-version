import colors from './tailwind-v3-colors.json' with { type: 'json' }

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Keep v3 visual values while replacing its vulnerable glob toolchain.
      spacing: {
        "0": "0px",
        "1": "0.25rem",
        "2": "0.5rem",
        "3": "0.75rem",
        "4": "1rem",
        "5": "1.25rem",
        "6": "1.5rem",
        "7": "1.75rem",
        "8": "2rem",
        "9": "2.25rem",
        "10": "2.5rem",
        "11": "2.75rem",
        "12": "3rem",
        "14": "3.5rem",
        "16": "4rem",
        "20": "5rem",
        "24": "6rem",
        "28": "7rem",
        "32": "8rem",
        "36": "9rem",
        "40": "10rem",
        "44": "11rem",
        "48": "12rem",
        "52": "13rem",
        "56": "14rem",
        "60": "15rem",
        "64": "16rem",
        "72": "18rem",
        "80": "20rem",
        "96": "24rem",
        "px": "1px",
        "0.5": "0.125rem",
        "1.5": "0.375rem",
        "2.5": "0.625rem",
        "3.5": "0.875rem"
      },
      boxShadow: {
        "sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "DEFAULT": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "md": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "lg": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
        "xl": "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
        "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
        "inner": "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
        "none": "none"
      },
      borderRadius: {
        "none": "0px",
        "sm": "0.125rem",
        "DEFAULT": "0.25rem",
        "md": "0.375rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "full": "9999px"
      },
      blur: {
        "0": "0",
        "none": "",
        "sm": "4px",
        "DEFAULT": "8px",
        "md": "12px",
        "lg": "16px",
        "xl": "24px",
        "2xl": "40px",
        "3xl": "64px"
      },
      fontFamily: {
        "sans": [
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "\"Apple Color Emoji\"",
          "\"Segoe UI Emoji\"",
          "\"Segoe UI Symbol\"",
          "\"Noto Color Emoji\""
        ],
        "serif": [
          "ui-serif",
          "Georgia",
          "Cambria",
          "\"Times New Roman\"",
          "Times",
          "serif"
        ],
        "mono": [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "\"Liberation Mono\"",
          "\"Courier New\"",
          "monospace"
        ]
      },
      borderColor: {
        "DEFAULT": "#e5e7eb"
      },
      ringColor: {
        "DEFAULT": "#3b82f6"
      },
      ringWidth: {
        "DEFAULT": "3px"
      },

      colors: {
        ...colors,
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
