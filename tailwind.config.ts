import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617"
        },
        mint: {
          50: "#edfff8",
          100: "#d5ffed",
          300: "#76f3c4",
          500: "#16c784",
          700: "#0b7c56"
        },
        coral: {
          50: "#fff5f2",
          300: "#ff9d86",
          500: "#f35b3d",
          700: "#b73722"
        }
      },
      boxShadow: {
        soft: "0 20px 60px -30px rgba(15, 23, 42, 0.55)"
      }
    }
  },
  plugins: []
};

export default config;
