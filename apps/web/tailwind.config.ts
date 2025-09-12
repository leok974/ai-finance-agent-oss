import type { Config } from "tailwindcss"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const animate = (() => { try { return require("tailwindcss-animate") } catch { return undefined } })()

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        card: "#111418",
        "card-foreground": "#e6e6e7",
        background: "#0b0b0d",
      },
    },
  },
  plugins: animate ? [animate] : [],
} satisfies Config
