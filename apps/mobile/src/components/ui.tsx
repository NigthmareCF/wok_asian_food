import { PropsWithChildren, Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getThemeColors } from "@/theme/colors";

const themes = { light: createTheme("light"), dark: createTheme("dark") };

function createTheme(scheme: "light" | "dark") {
  const colors = getThemeColors(scheme);
  return {
    colors,
    ui: StyleSheet.create({
      row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
      section: { gap: 12 },
      body: { color: colors.mutedForeground, fontSize: 16, lineHeight: 24 },
      pill: { alignSelf: "flex-start", color: colors.successForeground, backgroundColor: colors.surfaceElevated, overflow: "hidden", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, fontSize: 12, fontWeight: "700" },
      link: { color: colors.primary, fontWeight: "700", fontSize: 16, lineHeight: 24, minHeight: 44, minWidth: 44, paddingVertical: 12 },
      spacer: { height: 8 },
    }),
  };
}

export function useUiTheme() {
  return themes[useColorScheme() === "dark" ? "dark" : "light"];
}

export function Page({ children, safeTop = false, className = "", ...props }: PropsWithChildren<ViewProps & { safeTop?: boolean }>) {
  const insets = useSafeAreaInsets();
  return <View className="flex-1 bg-background" style={{ paddingTop: safeTop ? insets.top : 0, paddingLeft: insets.left, paddingRight: insets.right }}>
    <View {...props} className={`mx-auto w-full max-w-5xl flex-1 gap-6 px-4 py-6 sm:px-6 ${className}`} style={props.style}>{children}</View>
  </View>;
}

export function Heading({ children, eyebrow }: PropsWithChildren<{ eyebrow?: string }>) {
  return <View className="gap-2">
    {eyebrow ? <Text className="font-sans text-xs font-extrabold uppercase tracking-eyebrow text-primary">{eyebrow}</Text> : null}
    <Text accessibilityRole="header" className="font-sans text-3xl font-extrabold text-foreground sm:text-4xl">{children}</Text>
  </View>;
}

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <View className={`gap-3 rounded-lg border border-border bg-surface p-4 sm:p-6 ${className}`}>{children}</View>;
}

type ButtonProps = { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean; accessibilityLabel?: string };

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <View accessible={false} className={`rounded-sm bg-muted ${className}`} />;
}

export function Button({ title, onPress, secondary = false, disabled = false, busy = false, accessibilityLabel = title }: ButtonProps) {
  const { colors } = useUiTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    className={`min-h-12 min-w-11 items-center justify-center rounded-md border px-4 py-3 focus:ring-2 focus:ring-ring ${secondary ? "border-border bg-transparent active:bg-surface-elevated" : "border-transparent bg-primary active:bg-primary-hover"} ${disabled || busy ? "opacity-50" : "active:opacity-80"}`}>
    {busy ? <ActivityIndicator accessibilityLabel="Procesando" color={secondary ? colors.foreground : colors.primaryForeground} /> : <Text className={`text-center font-sans text-base font-bold ${secondary ? "text-foreground" : "text-primary-foreground"}`}>{title}</Text>}
  </Pressable>;
}

export function Field({ label, className = "", style, ref, ...props }: TextInputProps & { label: string; ref?: Ref<TextInput> }) {
  return <View className="gap-2">
    <Text className="font-sans text-sm font-bold text-foreground">{label}</Text>
    <TextInput ref={ref} {...props} accessibilityLabel={props.accessibilityLabel ?? label}
      className={`min-h-12 rounded-md border border-border bg-surface-elevated px-3 py-3 font-sans text-base text-foreground placeholder:text-subtle-foreground focus:border-ring ${props.multiline ? "min-h-28" : ""} ${className}`} style={style} />
  </View>;
}

const noticeClasses = {
  info: "bg-info/10 text-info-foreground",
  error: "bg-destructive/10 text-destructive-foreground",
  success: "bg-success/10 text-success-foreground",
};

export function Notice({ children, tone = "info" }: PropsWithChildren<{ tone?: keyof typeof noticeClasses }>) {
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className={`rounded-md p-3 font-sans text-sm leading-5 ${noticeClasses[tone]}`}>{children}</Text>;
}
