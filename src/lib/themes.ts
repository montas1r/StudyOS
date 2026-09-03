export type ThemeId = "dark" | "light" | "cyberpunk" | "matcha" | "midnight" | "forest" | "espresso";

export interface ThemeVars {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  accent: string;
  accentHover: string;
  amber: string;
  green: string;
  red: string;
  cardBg: string;
  sidebarBg: string;
  topbarBg: string;
}

export const THEMES: Record<ThemeId, { label: string; description: string; vars: ThemeVars; preview: { bg: string; surface: string; accent: string; text: string } }> = {
  dark: {
    label: "Dark",
    description: "Classic dark mode",
    vars: {
      bg: "#10121c",
      surface: "#191c2b",
      surface2: "#232739",
      border: "#2a2e42",
      borderStrong: "#3a3f58",
      text: "#edebe2",
      textDim: "#9498b0",
      accent: "#e8a33d",
      accentHover: "#d4922f",
      amber: "#e8a33d",
      green: "#6fbf8b",
      red: "#e1614b",
      cardBg: "#12141f",
      sidebarBg: "#0d0f18",
      topbarBg: "#0d0f18",
    },
    preview: { bg: "#10121c", surface: "#191c2b", accent: "#e8a33d", text: "#edebe2" },
  },
  light: {
    label: "Light",
    description: "Clean bright mode",
    vars: {
      bg: "#f0eff4",
      surface: "#ffffff",
      surface2: "#e8e7ed",
      border: "#d4d3dc",
      borderStrong: "#b8b7c0",
      text: "#1a1b23",
      textDim: "#6b6d80",
      accent: "#d4881a",
      accentHover: "#bf7a15",
      amber: "#d4881a",
      green: "#3d9960",
      red: "#d04535",
      cardBg: "#ffffff",
      sidebarBg: "#f8f7fb",
      topbarBg: "#f8f7fb",
    },
    preview: { bg: "#f0eff4", surface: "#ffffff", accent: "#d4881a", text: "#1a1b23" },
  },
  cyberpunk: {
    label: "Cyberpunk Focus",
    description: "Neon-lit night mode",
    vars: {
      bg: "#0a0a12",
      surface: "#12121f",
      surface2: "#1a1a2e",
      border: "#2d1f4e",
      borderStrong: "#4a2d8a",
      text: "#e0e0ff",
      textDim: "#8888bb",
      accent: "#00f5d4",
      accentHover: "#00d4b8",
      amber: "#f5a623",
      green: "#00f5d4",
      red: "#ff2d6f",
      cardBg: "#0e0e1a",
      sidebarBg: "#08080f",
      topbarBg: "#08080f",
    },
    preview: { bg: "#0a0a12", surface: "#1a1a2e", accent: "#00f5d4", text: "#e0e0ff" },
  },
  matcha: {
    label: "Warm Matcha",
    description: "Earthy green warmth",
    vars: {
      bg: "#1a1e1a",
      surface: "#222822",
      surface2: "#2c342c",
      border: "#3a4a3a",
      borderStrong: "#4a5e4a",
      text: "#e8ede0",
      textDim: "#8a9e82",
      accent: "#a8d060",
      accentHover: "#96bc55",
      amber: "#d4b85a",
      green: "#a8d060",
      red: "#d46a5a",
      cardBg: "#1c201c",
      sidebarBg: "#141814",
      topbarBg: "#141814",
    },
    preview: { bg: "#1a1e1a", surface: "#2c342c", accent: "#a8d060", text: "#e8ede0" },
  },
  midnight: {
    label: "Deep Midnight",
    description: "Deep ocean blues",
    vars: {
      bg: "#0c1020",
      surface: "#131830",
      surface2: "#1a2040",
      border: "#243060",
      borderStrong: "#304080",
      text: "#dce4f0",
      textDim: "#7888a8",
      accent: "#5b8def",
      accentHover: "#4a7de0",
      amber: "#f0b848",
      green: "#5bc88d",
      red: "#ef6b6b",
      cardBg: "#101428",
      sidebarBg: "#0a0e1c",
      topbarBg: "#0a0e1c",
    },
    preview: { bg: "#0c1020", surface: "#1a2040", accent: "#5b8def", text: "#dce4f0" },
  },
  forest: {
    label: "Forest Ambient",
    description: "Deep woodland tones",
    vars: {
      bg: "#111a14",
      surface: "#182218",
      surface2: "#1f2c1f",
      border: "#2a3c2a",
      borderStrong: "#3a503a",
      text: "#dce8d8",
      textDim: "#7a9872",
      accent: "#6dbf5e",
      accentHover: "#5eae50",
      amber: "#c8a840",
      green: "#6dbf5e",
      red: "#c86050",
      cardBg: "#141e14",
      sidebarBg: "#0e160e",
      topbarBg: "#0e160e",
    },
    preview: { bg: "#111a14", surface: "#1f2c1f", accent: "#6dbf5e", text: "#dce8d8" },
  },
  espresso: {
    label: "Espresso Study",
    description: "Warm coffeehouse vibes",
    vars: {
      bg: "#1a1512",
      surface: "#241e1a",
      surface2: "#2e2822",
      border: "#3e3530",
      borderStrong: "#524840",
      text: "#ede4d8",
      textDim: "#a09080",
      accent: "#d4944a",
      accentHover: "#c4853a",
      amber: "#d4944a",
      green: "#8abf6a",
      red: "#c46050",
      cardBg: "#1e1815",
      sidebarBg: "#141010",
      topbarBg: "#141010",
    },
    preview: { bg: "#1a1512", surface: "#2e2822", accent: "#d4944a", text: "#ede4d8" },
  },
};

let transitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyTheme(themeId: ThemeId) {
  const theme = THEMES[themeId] ?? THEMES.dark;
  const root = document.documentElement;
  const v = theme.vars;

  // Enable smooth transition only during theme switches
  root.classList.add("theme-transitioning");
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => root.classList.remove("theme-transitioning"), 350);

  root.style.setProperty("--bg", v.bg);
  root.style.setProperty("--surface", v.surface);
  root.style.setProperty("--surface-2", v.surface2);
  root.style.setProperty("--border", v.border);
  root.style.setProperty("--border-strong", v.borderStrong);
  root.style.setProperty("--text", v.text);
  root.style.setProperty("--text-dim", v.textDim);
  root.style.setProperty("--accent-color", v.accent);
  root.style.setProperty("--amber", v.amber);
  root.style.setProperty("--green", v.green);
  root.style.setProperty("--red", v.red);
  root.style.setProperty("--bg-primary", v.bg);
  root.style.setProperty("--card-bg", v.cardBg);
  root.style.setProperty("--sidebar-bg", v.sidebarBg);
  root.style.setProperty("--topbar-bg", v.topbarBg);
  root.setAttribute("data-theme", themeId);
}
