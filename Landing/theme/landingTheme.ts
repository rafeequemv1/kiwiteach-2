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
    /** Home marketing hero: teal + soft golden wash (brand). */
    homeHeroWash:
      "radial-gradient(ellipse 90% 70% at 85% 15%, rgba(242, 196, 78, 0.14), transparent 52%), radial-gradient(ellipse 60% 50% at 10% 90%, rgba(242, 196, 78, 0.1), transparent 50%), radial-gradient(circle at 20% 20%, rgba(58, 219, 188, 0.2), transparent 42%), radial-gradient(circle at 70% 75%, rgba(53, 195, 174, 0.08), transparent 40%)",
    darkPanel: "linear-gradient(135deg, #17233f 0%, #1d2b4b 50%, #2b3653 100%)",
    testPrepHero: "linear-gradient(135deg, #102347 0%, #14305f 52%, #1c3f78 100%)",
    /** NEET / test-prep heroes: navy with subtle gold rim light. */
    testPrepHeroWash:
      "radial-gradient(ellipse 80% 55% at 100% 0%, rgba(242, 196, 78, 0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(242, 196, 78, 0.08), transparent 50%)",
    neetHeroWash:
      "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(242, 196, 78, 0.14), transparent 55%), radial-gradient(circle at 80% 80%, rgba(53, 195, 174, 0.06), transparent 45%)",
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
