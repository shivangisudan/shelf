import type { Config } from "tailwindcss";

const config = {
  theme: {
    extend: {
      colors: {
        sunken: "rgba(28,20,12,0.05)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        accent: "var(--accent)",
        "accent-deep": "var(--accent-deep)",
        "accent-fg": "var(--accent-fg)",
        success: "var(--success)",
        "success-bg": "var(--success-bg)",
        error: "var(--error)",
        "error-bg": "var(--error-bg)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
} satisfies Config;

export default config;