import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ppa: {
          accent: "#EF4444",
          navy: "#1F2937",
          muted: "#6B7280",
          bg: "#F3F4F6",
        },
        rank: {
          poor: "#FCA5A5",
          fair: "#FDE68A",
          good: "#FEF3C7",
          great: "#BBF7D0",
          elite: "#86EFAC",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
    },
  },
  plugins: [],
};

export default config;
