import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        leaf: { 500: "#22c55e", 600: "#16a34a", 700: "#15803d" },
        soil: { 500: "#a16207", 600: "#854d0e" }
      }
    }
  },
  plugins: []
};
export default config;

