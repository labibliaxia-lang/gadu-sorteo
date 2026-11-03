import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Identidad “taller de confianza”: amarillo seguridad + azul profundo.
        brand: {
          DEFAULT: "#F5B301",
          50: "#FFF9E6",
          100: "#FFF0B8",
          200: "#FFE176",
          300: "#FFD23A",
          400: "#F7BE0F",
          500: "#F5B301",
          600: "#D99A00",
          700: "#B37F00",
          800: "#8C6400",
          900: "#664900",
          foreground: "#071726",
        },
        ink: {
          DEFAULT: "#071726",
          soft: "#0F2438",
        },
        steel: {
          DEFAULT: "#64748B",
          100: "#E7EBF0",
          200: "#CBD5E1",
          500: "#64748B",
          700: "#334155",
        },
        surface: "#F7F9FB",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "var(--font-space-grotesk)",
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-ibm-plex-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(7 23 38 / 0.04), 0 1px 3px 0 rgb(7 23 38 / 0.06)",
        card: "0 4px 16px -4px rgb(7 23 38 / 0.10), 0 2px 4px -2px rgb(7 23 38 / 0.06)",
        glow: "0 0 0 1px rgb(245 179 1 / 0.35), 0 8px 24px -4px rgb(245 179 1 / 0.25)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.25s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
