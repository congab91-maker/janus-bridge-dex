import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        imperial: {
          gold: "#F5B041",
          amber: "#D4AF37",
          crimson: "#8B1E3F",
          obsidian: "#07090E",
          slate: "#0F1420",
        },
      },
    },
  },
  plugins: [],
};

export default config;
