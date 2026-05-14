import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    // Add a 3xl breakpoint so 4K / ultra-wide monitors can use the
    // wider container defined in app/layout.tsx without the content
    // collapsing to a narrow strip in the middle of the screen.
    screens: {
      sm:  "640px",
      md:  "768px",
      lg:  "1024px",
      xl:  "1280px",
      "2xl": "1536px",
      "3xl": "1920px",
    },
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

