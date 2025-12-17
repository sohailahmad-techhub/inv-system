import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0ea5e9',
        secondary: '#6366f1',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#06b6d4'
      }
    }
  },
  plugins: []
} satisfies Config;
