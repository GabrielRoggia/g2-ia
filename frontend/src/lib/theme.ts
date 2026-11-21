// Tokens do design system (tema escuro padrão + claro), portados do CSS do console
// para valores usados em StyleSheet do React Native.

export const palette = {
  accent: "#f75500",
  accentHover: "#e04d00",
  accentBright: "#ff7a33",
  success: "#4cd137",
  warning: "#f2b200",
  danger: "#fe5b5f",
  info: "#1d5fc9",
  sidebar: "#1e2128",
  sidebarLine: "#2c3038",
  chart: ["#8170f2", "#3498db", "#48d4d4", "#f75500", "#4cd137", "#f2b200", "#fe5b5f", "#2f7fd1"],
};

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  raised: string;
  field: string;
  hover: string;
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  line: string;
  lineSoft: string;
  lineStrong: string;
  islBg: string;
  islLine: string;
  islStrong: string;
  okText: string;
  warnText: string;
  badText: string;
  infoText: string;
  raisedFill: [string, string];
  shadow: string;
};

export const darkTheme: Theme = {
  dark: true,
  bg: "#0f1115",
  surface: "#181b21",
  surface2: "#1d2027",
  raised: "#20242c",
  field: "#13161b",
  hover: "rgba(255,255,255,0.05)",
  text1: "#c2c6cd",
  text2: "#a3a9b3",
  text3: "#868d98",
  text4: "#6b7280",
  line: "#2a2f38",
  lineSoft: "#22262e",
  lineStrong: "#3a404b",
  islBg: "rgba(29,32,39,0.82)",
  islLine: "rgba(255,255,255,0.08)",
  islStrong: "#e1e4e8",
  okText: "#4cd137",
  warnText: "#f5c04f",
  badText: "#fe5b5f",
  infoText: "#72a8ff",
  raisedFill: ["#20242c", "#1d2027"],
  shadow: "rgba(0,0,0,0.4)",
};

export const lightTheme: Theme = {
  dark: false,
  bg: "#f3f4f6",
  surface: "#ffffff",
  surface2: "#f7f8fa",
  raised: "#ffffff",
  field: "#ffffff",
  hover: "rgba(16,24,40,0.04)",
  text1: "#1d2129",
  text2: "#474e59",
  text3: "#5e6672",
  text4: "#838b97",
  line: "#e1e4e9",
  lineSoft: "#eceef1",
  lineStrong: "#c4cad2",
  islBg: "rgba(255,255,255,0.78)",
  islLine: "rgba(16,24,40,0.08)",
  islStrong: "#1d2129",
  okText: "#2fa84a",
  warnText: "#8f5500",
  badText: "#e5484d",
  infoText: "#1d5fc9",
  raisedFill: ["#ffffff", "#f7f8fa"],
  shadow: "rgba(16,24,40,0.08)",
};

export const radius = { field: 10, tile: 12, panel: 14, card: 18, float: 22, pill: 999 };

export const font = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  table: "Inter_400Regular",
  tableSemi: "Inter_600SemiBold",
};

/** Mistura uma cor hex com transparência (equivalente ao color-mix do CSS). */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export const ICON = { size: 18, stroke: 1.75 };
