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
        sans: ["Aptos", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        clinical: "0 18px 45px rgba(20, 33, 61, 0.08)",
      },
    },
  },
  plugins: [],
};
