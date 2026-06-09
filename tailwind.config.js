/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#06070B',
        deep: '#0A0C12',
        surface: '#0F1118',
        elevated: '#161A26',
        ink: { DEFAULT: '#EDEFF7', secondary: '#9EA3B8', muted: '#4A5068' },
        aurora: { cyan: '#6EE7F9', blue: '#818CF8', violet: '#A78BFA', pink: '#F472B6', ember: '#FB923C' },
      },
      fontFamily: {
        display: ['"Clash Display"', 'Space Grotesk', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(2.5rem, 7vw, 5rem)', { lineHeight: '1.04', letterSpacing: '-0.035em', fontWeight: '700' }],
        display: ['clamp(2rem, 5vw, 3.25rem)', { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '600' }],
      },
      borderRadius: { sm: '6px', md: '12px', lg: '20px', xl: '28px' },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(110,231,249,0.25)',
        'glow-cyan': '0 0 24px rgba(110,231,249,0.35), 0 0 80px rgba(110,231,249,0.12)',
        'glow-violet': '0 0 24px rgba(167,139,250,0.35), 0 0 80px rgba(167,139,250,0.12)',
        glass:
          '0 0 48px rgba(110,231,249,0.06), 0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(237,239,247,0.06)',
      },
      backgroundImage: {
        aurora: 'linear-gradient(135deg, #6EE7F9 0%, #818CF8 35%, #A78BFA 65%, #F472B6 100%)',
      },
      keyframes: {
        drift: { '0%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' }, '100%': { backgroundPosition: '0% 50%' } },
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        blink: { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0' } },
        'pulse-glow': { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } },
        'aurora-move': {
          '0%': { transform: 'translate(-10%, -10%) rotate(0deg)' },
          '50%': { transform: 'translate(10%, 5%) rotate(180deg)' },
          '100%': { transform: 'translate(-10%, -10%) rotate(360deg)' },
        },
      },
      animation: {
        drift: 'drift 8s linear infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
        float: 'float 6s ease-in-out infinite',
        blink: 'blink 1.1s step-end infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'aurora-move': 'aurora-move 40s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
