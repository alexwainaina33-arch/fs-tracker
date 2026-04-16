/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Syne"', "sans-serif"],
        body:    ['"Outfit"', "sans-serif"],
        mono:    ['"IBM Plex Mono"', "monospace"],
      },
      colors: {
        lime:   { DEFAULT: "#c8f230", dark: "#a8cc20" },
        ink:    { DEFAULT: "#0a0d0f", 2: "#111418", 3: "#181c21", 4: "#21272f" },
        fog:    { DEFAULT: "#8b95a1", light: "#c2cad4" },
        danger: "#ff4d4f",
        warn:   "#ffab00",
        ok:     "#00c096",
        info:   "#3b82f6",
      },
      animation: {
        "pulse-lime": "pulse-lime 2s ease-in-out infinite",
        "slide-up":   "slide-up 0.4s cubic-bezier(0.16,1,0.3,1)",
        "fade-in":    "fade-in 0.3s ease",
      },
      keyframes: {
        "pulse-lime": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(200,242,48,0.4)" },
          "50%":     { boxShadow: "0 0 0 8px rgba(200,242,48,0)" },
        },
        "slide-up": {
          from: { opacity: 0, transform: "translateY(16px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: 0 },
          to:   { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};