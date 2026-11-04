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
          hover: "hsl(var(--primary-hover))",
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

        /* ==== Sistema "Mesa de sorteo" (dark-saas) ==== */
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        panel: {
          1: "hsl(var(--panel-1) / <alpha-value>)",
          2: "hsl(var(--panel-2) / <alpha-value>)",
          3: "hsl(var(--panel-3) / <alpha-value>)",
        },
        hairline: {
          DEFAULT: "hsl(var(--hairline) / <alpha-value>)",
          strong: "hsl(var(--hairline-strong) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "hsl(var(--fg) / <alpha-value>)",
          muted: "hsl(var(--fg-muted) / <alpha-value>)",
          subtle: "hsl(var(--fg-subtle) / <alpha-value>)",
          faint: "hsl(var(--fg-faint) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          hover: "hsl(var(--gold-hover) / <alpha-value>)",
          ink: "hsl(var(--on-gold) / <alpha-value>)",
        },
        success: "hsl(var(--success) / <alpha-value>)",

        /* ==== Identidad heredada: taller de confianza ==== */
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
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        glow: "0 0 0 1px rgb(245 179 1 / 0.35), 0 8px 24px -12px rgb(245 179 1 / 0.35)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "live-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.28s ease-out both",
        "live-pulse": "live-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
