import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        panel: "var(--panel)",
        panel2: "var(--panel2)",
        line: "var(--line)",
        text: "var(--text)",
        dim: "var(--dim)",
        amber: "#f5a623",
        flame: "#ff6b35",
        mint: "#5be37d",
        blood: "#e8453c",
        sky: "#5bc0eb",
        grape: "#b07cff",
      },
      fontFamily: {
        head: ["var(--font-head)", "monospace"],
        body: ["var(--font-body)", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
