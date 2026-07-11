/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        rehab: {
          red: "#F94144",
          orange: "#F8961E",
          yellow: "#F9C74F",
          green: "#90BE6D",
          teal: "#43AA8B",
          blue: "#577590",
          ink: "#14213D",
          muted: "#64748B",
          line: "#E2E8F0",
          bg: "#F8FAFC",
        },
      },
      fontFamily: {
        sans: ["Inter", "Aptos", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        clinical: "0 1px 2px rgba(20, 33, 61, 0.05), 0 10px 30px rgba(20, 33, 61, 0.06)",
        "clinical-lg": "0 2px 4px rgba(20, 33, 61, 0.06), 0 22px 55px rgba(20, 33, 61, 0.1)",
      },
      letterSpacing: {
        kicker: "0.14em",
      },
    },
  },
  plugins: [],
};
