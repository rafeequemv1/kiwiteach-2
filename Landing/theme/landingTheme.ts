export const landingTheme = {
  fonts: {
    heading: "font-['Lato',sans-serif] font-black tracking-tight",
    body: "font-['Inter',sans-serif]",
  },
  colors: {
    page: "#f5f6fb",
    surface: "#ffffff",
    text: "#171a2e",
    textMuted: "#5f6783",
    navy: "#1c2442",
    navySoft: "#273156",
    accent: "#35c3ae",
    accentWarm: "#f2c44e",
    borderSoft: "#e8ebf4",
  },
  gradients: {
    hero: "linear-gradient(135deg, #f2f0df 0%, #ece8d6 45%, #f6f3e5 100%)",
    darkPanel: "linear-gradient(135deg, #17233f 0%, #1d2b4b 50%, #2b3653 100%)",
    testPrepHero: "linear-gradient(135deg, #102347 0%, #14305f 52%, #1c3f78 100%)",
    button: "linear-gradient(90deg, #37c7b2 0%, #5ad6a5 100%)",
    glow: "radial-gradient(circle at 20% 20%, rgba(58, 219, 188, 0.22), transparent 45%)",
  },
  shadow: {
    soft: "0 8px 20px rgba(18, 28, 63, 0.08)",
    card: "0 10px 24px rgba(20, 32, 70, 0.12)",
  },
  radius: {
    xl: "1rem",
    xxl: "1.75rem",
    hero: "2rem",
  },
};

export type LandingTheme = typeof landingTheme;
