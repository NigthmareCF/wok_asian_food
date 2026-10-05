<<<<<<< HEAD
import { PropsWithChildren } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps } from "react-native";
=======
import { PropsWithChildren, Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewProps, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getThemeColors } from "@/theme/colors";
>>>>>>> 9997cf0e (fix(mobile): adjust BFF, add cart/menu flows, UI components, hooks and tests)

export const palette = { ink: "#24221f", muted: "#746e67", paper: "#fffaf2", card: "#ffffff", red: "#a72d21", gold: "#d78c23", line: "#eadfce", green: "#246b4b" };

export function Page({ children, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props} style={[styles.page, props.style]}>{children}</View>;
}

export function Heading({ children, eyebrow }: PropsWithChildren<{ eyebrow?: string }>) {
  return <View style={styles.heading}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}<Text style={styles.title}>{children}</Text></View>;
}

export function Card({ children }: PropsWithChildren) { return <View style={styles.card}>{children}</View>; }

export function Button({ title, onPress, secondary = false, disabled = false, busy = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, (disabled || busy) && styles.disabled, pressed && styles.pressed]}>
    {busy ? <ActivityIndicator color={secondary ? palette.red : "#fff"} /> : <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{title}</Text>}
  </Pressable>;
}

<<<<<<< HEAD
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor="#918a80" accessibilityLabel={label} style={styles.input} {...props} /></View>;
=======
export function Field({ label, className = "", style, ref, ...props }: TextInputProps & { label: string; ref?: Ref<TextInput> }) {
  return <View className="gap-2">
    <Text className="font-sans text-sm font-bold text-foreground">{label}</Text>
    <TextInput ref={ref} {...props} accessibilityLabel={props.accessibilityLabel ?? label}
      className={`min-h-12 rounded-md border border-border bg-surface-elevated px-3 py-3 font-sans text-base text-foreground placeholder:text-subtle-foreground focus:border-ring ${props.multiline ? "min-h-28" : ""} ${className}`} style={style} />
  </View>;
>>>>>>> 9997cf0e (fix(mobile): adjust BFF, add cart/menu flows, UI components, hooks and tests)
}

export function Notice({ children, tone = "info" }: PropsWithChildren<{ tone?: "info" | "error" | "success" }>) {
  return <Text accessibilityRole="alert" style={[styles.notice, tone === "error" && styles.error, tone === "success" && styles.success]}>{children}</Text>;
}

export const ui = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: 12 }, section: { gap: 12 }, body: { color: palette.muted, fontSize: 15, lineHeight: 22 }, pill: { alignSelf: "flex-start", color: palette.green, backgroundColor: "#e6f1e9", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, fontWeight: "700" }, link: { color: palette.red, fontWeight: "700", fontSize: 15 }, spacer: { height: 8 } });

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.paper, padding: 22, gap: 18 },
  heading: { gap: 6, marginBottom: 2 }, eyebrow: { color: palette.red, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }, title: { color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: "800" },
  card: { backgroundColor: palette.card, borderRadius: 18, borderWidth: 1, borderColor: palette.line, padding: 18, gap: 12 },
  button: { minHeight: 50, paddingHorizontal: 18, borderRadius: 13, backgroundColor: palette.red, alignItems: "center", justifyContent: "center" }, buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: palette.red }, buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" }, buttonTextSecondary: { color: palette.red }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.78 },
  field: { gap: 7 }, label: { color: palette.ink, fontSize: 14, fontWeight: "700" }, input: { minHeight: 48, borderColor: palette.line, borderWidth: 1, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, color: palette.ink, fontSize: 16 },
  notice: { color: "#4d473e", backgroundColor: "#f2e9d9", borderRadius: 12, padding: 14, lineHeight: 20 }, error: { color: "#842319", backgroundColor: "#fae5e1" }, success: { color: "#1d593d", backgroundColor: "#e3f2e8" },
});
