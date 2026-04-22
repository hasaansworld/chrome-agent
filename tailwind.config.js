/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0b0f",
          panel: "#141418",
          subtle: "#1c1c22",
          hover: "#23232b",
        },
        border: {
          DEFAULT: "#26262e",
          strong: "#35353f",
        },
        text: {
          primary: "#f5f5f7",
          secondary: "#9ca3af",
          muted: "#6b7280",
        },
        accent: {
          DEFAULT: "#c48b4a",
          hover: "#d49a5a",
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        xxs: ['10px', '14px'],
      },
    },
  },
  plugins: [],
};
