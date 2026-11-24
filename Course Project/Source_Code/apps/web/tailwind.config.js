/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
        sans: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
        institutional: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        inst: {
          bg: "var(--bg)",
          surface: "var(--surface)",
          border: "var(--border)",
          text: "var(--text)",
          "text-muted": "var(--text-muted)",
          primary: "var(--primary)",
          "primary-hover": "var(--primary-hover)",
          "primary-tint": "var(--primary-tint)",
          amber: "var(--amber)",
          "amber-bg": "var(--amber-bg)",
          danger: "var(--danger)",
          "danger-bg": "var(--danger-bg)",
          success: "var(--success)",
          "success-bg": "var(--success-bg)",
          info: "var(--info)",
          "info-bg": "var(--info-bg)",
        },
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
        chip: "999px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(16, 37, 31, 0.06)",
      },
    },
  },
  plugins: [],
};
