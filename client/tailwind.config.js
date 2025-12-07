/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        neutral: {
          50: "#fafafa",
          100: "#f5f7fb",
          200: "#eef2f6",
          300: "#e6eef9",
          400: "#cddff1",
          500: "#8aa2bf",
        },
        accent: {
          500: "#2563eb", // blue-600
          600: "#1d4ed8",
        },
        success: "#16a34a",
      },
      borderRadius: {
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        soft: "0 6px 18px rgba(20, 27, 38, 0.06)",
      },
    },
  },
  plugins: [],
};
