/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0D0501',
          'bg-soft': '#130800',
          surface: '#1A0D06',
          'surface-light': '#251508',
          'surface-strong': '#32200C',
          border: '#3D2512',
          'border-strong': '#5A3A1E',
          overlay: '#0D0501E0',
          'overlay-soft': '#130800C7',
          gold: '#D4A017',
          'gold-soft': '#E8BE50',
          'gold-muted': '#A07C12',
          choc: '#6B3A1E',
          'choc-light': '#8B5230',
          text: '#F6EFE4',
          'text-muted': '#C4B59A',
          'text-dim': '#8A7560',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      fontSize: {
        'nav': ['13px', { lineHeight: '1', fontWeight: '600' }],
        'product-name': ['15px', { lineHeight: '1.3', fontWeight: '600' }],
        'product-price': ['17px', { lineHeight: '1.2', fontWeight: '700' }],
        'section-heading': ['19px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-heading': ['22px', { lineHeight: '1.2', fontWeight: '800' }],
      },
      boxShadow: {
        'card': '0 6px 18px rgba(13, 5, 1, 0.50)',
        'card-hover': '0 10px 26px rgba(13, 5, 1, 0.60), 0 0 1px rgba(212,160,23,0.14)',
        'elevated': '0 14px 40px rgba(13, 5, 1, 0.65)',
        'glass': '0 10px 34px rgba(13, 5, 1, 0.55)',
        'glow-gold': '0 0 32px rgba(212,160,23,0.25)',
        'glow-gold-lg': '0 0 60px rgba(212,160,23,0.20), 0 0 120px rgba(212,160,23,0.10)',
        'glow-choc': '0 0 40px rgba(107,58,30,0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'bounce-subtle': 'bounceSubtle 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'marquee': 'marquee 25s linear infinite',
        'confetti': 'confetti 3s ease-out forwards',
        'glow-gold-pulse': 'glowGoldPulse 0.6s ease-out',
        'float': 'float 4s ease-in-out infinite',
        'float-delayed': 'float 4s ease-in-out 1.5s infinite',
        'shimmer-sweep': 'shimmerSweep 1.8s ease-in-out infinite',
        'ride': 'ride 1.8s ease-in-out infinite',
        'road-scroll': 'roadScroll 1.2s linear infinite',
        'ambient-pulse': 'ambientPulse 6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(400px) rotate(720deg)', opacity: '0' },
        },
        glowGoldPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(212,160,23,0.4)' },
          '50%': { boxShadow: '0 0 16px 6px rgba(212,160,23,0.2)' },
          '100%': { boxShadow: '0 0 0 0 rgba(212,160,23,0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmerSweep: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ride: {
          '0%, 100%': { transform: 'translateY(0px) rotate(-3deg)' },
          '40%': { transform: 'translateY(-7px) rotate(2deg)' },
          '70%': { transform: 'translateY(-3px) rotate(-1deg)' },
        },
        roadScroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        ambientPulse: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.08)' },
        },
      },
    },
  },
  plugins: [],
};
