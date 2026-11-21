// Componentes visuais base: texto, cards, painéis, botões, tags, seletor segmentado,
// campos, estados vazio/carregando e grade responsiva de 12/6/1 colunas.
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";

import { useTheme } from "../lib/store";
import { font, ICON, palette, radius, tint } from "../lib/theme";

type PState = { pressed: boolean; hovered?: boolean };

// ───────────── Texto ─────────────
type TxtProps = TextProps & {
  size?: number;
  weight?: "regular" | "medium" | "semibold" | "bold";
  color?: string;
  tone?: 1 | 2 | 3 | 4;
  tabular?: boolean;
};
export function Txt({ size = 13, weight = "regular", color, tone = 1, tabular, style, ...rest }: TxtProps) {
  const t = useTheme();
  const c = color ?? [t.text1, t.text1, t.text2, t.text3, t.text4][tone];
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: font[weight], fontSize: size, color: c },
        tabular && ({ fontVariant: ["tabular-nums"] } as TextStyle),
        style,
      ]}
    />
  );
}

// ───────────── Grade ─────────────
export function useCols() {
  const { width } = useWindowDimensions();
  return width >= 1200 ? 12 : width >= 760 ? 6 : 1;
}

export function Grid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -8 }, style]}>{children}</View>;
}

export function Col({ span = 12, children, style }: { span?: 3 | 4 | 6 | 8 | 9 | 12; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const cols = useCols();
  // 12 colunas no desktop; em telas médias só os blocos de 1/4 ficam lado a lado
  const frac = cols === 12 ? span / 12 : cols === 6 ? (span <= 3 ? 0.5 : 1) : 1;
  return <View style={[{ width: `${frac * 100}%`, paddingHorizontal: 8, paddingBottom: 16, minWidth: 0 }, style]}>{children}</View>;
}

// ───────────── Cards e painéis ─────────────
export function Card({ children, style, pad = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: radius.card, padding: pad ? 18 : 0, minWidth: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Panel({
  title,
  right,
  children,
  style,
  bodyStyle,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: radius.panel, overflow: "hidden" }, style]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: t.line,
        }}
      >
        <Txt size={11} weight="bold" tone={2} style={{ textTransform: "uppercase", letterSpacing: 0.8 }} numberOfLines={1}>
          {title}
        </Txt>
        {right}
      </View>
      <View style={[{ padding: 16 }, bodyStyle]}>{children}</View>
    </View>
  );
}

export function Tile({ children, style, onPress, active }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; active?: boolean }) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: active ? tint(palette.accent, 0.1) : t.surface2,
    borderRadius: radius.tile,
    padding: 12,
    borderWidth: 1,
    borderColor: active ? palette.accent : "transparent",
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={(s) => [base, (s as PState).hovered && !active && { backgroundColor: t.hover, borderColor: t.line }, style]}>
      {children}
    </Pressable>
  );
}

// ───────────── Ícone em círculo ─────────────
export function IconCircle({ icon: Icon, size = 40, color = palette.accent }: { icon: LucideIcon; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint(color, 0.12), alignItems: "center", justifyContent: "center" }}>
      <Icon size={size >= 50 ? 22 : 18} strokeWidth={ICON.stroke} color={color} />
    </View>
  );
}

// ───────────── Botões ─────────────
type BtnProps = {
  label?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};
export function Button({ label, icon: Icon, onPress, variant = "secondary", size = "md", disabled, loading, style, accessibilityLabel }: BtnProps) {
  const t = useTheme();
  const h = size === "sm" ? 28 : 36;
  const fills: Record<string, [string, string]> = {
    primary: ["#ff671a", palette.accent],
    danger: ["#ff7477", palette.danger],
    secondary: t.raisedFill,
    ghost: ["transparent", "transparent"],
  };
  const fg = variant === "primary" || variant === "danger" ? "#fff" : t.text1;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={(s) => [{ borderRadius: radius.field, opacity: disabled ? 0.45 : (s as PState).pressed ? 0.85 : 1 }, style]}
    >
      {(s) => (
        <LinearGradient
          colors={(s as PState).hovered && !off && variant === "primary" ? ["#ff5f0f", "#ea5000"] : fills[variant]}
          style={{
            height: h,
            paddingHorizontal: label ? (size === "sm" ? 10 : 14) : 0,
            width: label ? undefined : h,
            borderRadius: radius.field,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            borderWidth: variant === "secondary" ? 1 : variant === "ghost" ? 0 : 0,
            borderColor: t.line,
            borderTopColor: variant === "primary" || variant === "danger" ? "rgba(255,255,255,0.28)" : t.line,
            borderTopWidth: variant === "ghost" ? 0 : 1,
            backgroundColor: variant === "ghost" && (s as PState).hovered ? t.hover : undefined,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            Icon && <Icon size={16} strokeWidth={ICON.stroke} color={fg} />
          )}
          {label ? (
            <Txt size={size === "sm" ? 12 : 13} weight="medium" color={fg} numberOfLines={1}>
              {label}
            </Txt>
          ) : null}
        </LinearGradient>
      )}
    </Pressable>
  );
}

// ───────────── Tags ─────────────
export function Tag({ label, tone = "accent", dot }: { label: string; tone?: "accent" | "ok" | "warn" | "bad" | "info" | "none"; dot?: boolean }) {
  const t = useTheme();
  const map = {
    accent: [palette.accent, palette.accent],
    ok: [palette.success, t.okText],
    warn: [palette.warning, t.warnText],
    bad: [palette.danger, t.badText],
    info: [palette.info, t.infoText],
    none: [t.text4, t.text3],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: tint(bg, 0.14), flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />}
      <Txt size={11} weight="semibold" color={fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

// ───────────── Seletor segmentado ─────────────
export function Seg<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: radius.field, padding: 3, borderWidth: 1, borderColor: t.line, alignSelf: "flex-start", flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={(s) => ({
              paddingHorizontal: 12,
              height: 28,
              justifyContent: "center",
              borderRadius: 8,
              backgroundColor: active ? t.raised : (s as PState).hovered ? t.hover : "transparent",
              borderWidth: active ? 1 : 0,
              borderColor: t.line,
            })}
          >
            <Txt size={12} weight={active ? "semibold" : "medium"} color={active ? palette.accent : t.text2}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────── Campos ─────────────
export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Txt size={12} weight="medium" tone={2}>
        {label}
        {required ? <Txt color={palette.danger}> *</Txt> : null}
      </Txt>
      {children}
      {hint ? <Txt size={11} tone={4}>{hint}</Txt> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { multiline?: boolean }) {
  const t = useTheme();
  const [focus, setFocus] = React.useState(false);
  return (
    <TextInput
      placeholderTextColor={t.text4}
      {...props}
      onFocus={(e) => {
        setFocus(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          minHeight: 36,
          borderRadius: radius.field,
          borderWidth: 1,
          borderColor: focus ? palette.accent : t.dark ? t.lineStrong : t.line,
          backgroundColor: t.field,
          color: t.text1,
          paddingHorizontal: 12,
          paddingVertical: props.multiline ? 10 : 0,
          fontSize: 13,
          fontFamily: font.regular,
          // anel de foco (web)
          ...(focus ? ({ boxShadow: `0 0 0 3px ${tint(palette.accent, 0.32)}` } as object) : {}),
          ...({ outlineStyle: "none" } as object),
        },
        props.style,
      ]}
    />
  );
}

// ───────────── Estados ─────────────
export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 16, gap: 8 }}>
      <Icon size={36} strokeWidth={1.5} color={t.text4} />
      <Txt size={14} weight="semibold" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {text ? (
        <Txt size={12} tone={3} style={{ textAlign: "center", maxWidth: 380 }}>
          {text}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ height = 14, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: t.surface2, opacity: v }, style]} />;
}

// ───────────── Barra de progresso / domínio ─────────────
export function Meter({ value, color }: { value: number; color?: string }) {
  const t = useTheme();
  const c = color ?? (value >= 0.7 ? palette.success : value >= 0.45 ? palette.warning : palette.danger);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(2, Math.min(100, value * 100))}%`, height: 6, borderRadius: 3, backgroundColor: c }} />
    </View>
  );
}

export function masteryTone(v: number | null): "ok" | "warn" | "bad" | "none" {
  if (v == null) return "none";
  return v >= 0.7 ? "ok" : v >= 0.45 ? "warn" : "bad";
}

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
