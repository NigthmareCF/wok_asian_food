import { PropsWithChildren, Ref, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from "react-native";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getThemeColors } from "@/theme/colors";
import { darkTokens } from "@/theme/tokens";
import { Brand } from "./brand";

// Compatibility exports for screens that still use the original StyleSheet UI.
export const palette = {
  ink: "#24221f",
  muted: "#746e67",
  paper: "#fffaf2",
  card: "#ffffff",
  red: "#a72d21",
  gold: "#d78c23",
  line: "#eadfce",
  green: "#246b4b",
};
export const ui = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  section: { gap: 12 },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  pill: {
    alignSelf: "flex-start",
    color: palette.green,
    backgroundColor: "#e6f1e9",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    fontWeight: "700",
  },
  link: {
    color: palette.red,
    fontWeight: "700",
    fontSize: 15,
    minHeight: 44,
    minWidth: 44,
  },
  spacer: { height: 8 },
});

const themes = { light: createTheme("light"), dark: createTheme("dark") };
const focusColor = `rgb(${darkTokens["--focus"].replaceAll(" ", ", ")})`;

function createTheme(scheme: "light" | "dark") {
  const colors = getThemeColors(scheme);
  return {
    colors,
    ui: StyleSheet.create({
      row: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      },
      section: { gap: 12 },
      body: { color: colors.mutedForeground, fontSize: 16, lineHeight: 24 },
      pill: {
        alignSelf: "flex-start",
        color: colors.successForeground,
        backgroundColor: colors.surfaceElevated,
        overflow: "hidden",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: "700",
      },
      link: {
        color: colors.accentText,
        fontWeight: "700",
        fontSize: 16,
        lineHeight: 24,
        minHeight: 44,
        minWidth: 44,
        paddingVertical: 12,
      },
      spacer: { height: 8 },
    }),
  };
}

export function useUiTheme() {
  // Keep WOK branding coherent regardless of the device/browser preference.
  return themes.dark;
}

export function Page({
  children,
  safeTop = false,
  brand = false,
  className = "",
  ...props
}: PropsWithChildren<ViewProps & { safeTop?: boolean; brand?: boolean }>) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-1 bg-background"
      style={{
        paddingTop: safeTop ? insets.top : 0,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        {...props}
        className={`mx-auto w-full max-w-5xl flex-1 gap-6 px-4 py-6 sm:px-6 ${className}`}
        style={props.style}
      >
        {brand ? <Brand compact discreet /> : null}
        {children}
      </View>
    </View>
  );
}

export function Heading({
  children,
  eyebrow,
}: PropsWithChildren<{ eyebrow?: string }>) {
  const { colors } = useUiTheme();
  return (
    <View className="gap-2">
      {eyebrow ? (
        <Text
          style={{ color: colors.accentText }}
          className="font-sans text-xs font-extrabold uppercase tracking-eyebrow text-primary"
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        className="font-sans text-3xl font-extrabold text-foreground sm:text-4xl"
      >
        {children}
      </Text>
    </View>
  );
}

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  const { colors } = useUiTheme();
  return (
    <View
      style={{
        elevation: 3,
        shadowColor: colors.background,
        shadowOpacity: 0.24,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 12,
      }}
      className={`gap-3 rounded-lg border border-border bg-surface p-4 sm:p-6 ${className}`}
    >
      {children}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
};

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return (
    <View accessible={false} className={`rounded-sm bg-muted ${className}`} />
  );
}

export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  busy = false,
  accessibilityLabel = title,
}: ButtonProps) {
  const { colors } = useUiTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : secondary && pressed ? 0.85 : 1,
        backgroundColor: secondary
          ? undefined
          : pressed
            ? colors.primaryHover
            : colors.primary,
      })}
      className={`min-h-12 min-w-11 items-center justify-center rounded-md border px-4 py-3 focus:ring-2 focus:ring-ring ${secondary ? "border-border bg-transparent active:bg-surface-elevated" : "border-transparent bg-primary active:bg-primary-hover"}`}
    >
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Procesando"
          color={secondary ? colors.foreground : colors.actionForeground}
        />
      ) : (
        <Text
          style={{
            color: secondary ? colors.foreground : colors.actionForeground,
          }}
          className={`text-center font-sans text-base font-bold ${secondary ? "text-foreground" : "text-primary-foreground"}`}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  className = "",
  style,
  ref,
  icon,
  error,
  secureTextEntry,
  density = "comfortable",
  hideLabel = false,
  ...props
}: TextInputProps & {
  label: string;
  ref?: Ref<TextInput>;
  icon?: SymbolViewProps["name"];
  error?: string;
  density?: "comfortable" | "compact";
  hideLabel?: boolean;
}) {
  const { colors } = useUiTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-2">
      {!hideLabel ? (
        <Text className="font-sans text-sm font-bold text-foreground">
          {label}
        </Text>
      ) : null}
      <View
        className={`flex-row items-center gap-2 rounded-md border bg-surface-elevated px-3 ${error ? "border-destructive" : "border-border"}`}
        style={
          density === "compact"
            ? { minHeight: 44, ...(focused ? { borderColor: focusColor } : {}) }
            : undefined
        }
      >
        {icon ? (
          <SymbolView
            name={icon}
            size={density === "compact" ? 18 : 20}
            tintColor={colors.mutedForeground}
          />
        ) : null}
        <TextInput
          ref={ref}
          {...props}
          secureTextEntry={secureTextEntry && !passwordVisible}
          accessibilityLabel={props.accessibilityLabel ?? label}
          placeholderTextColor={colors.mutedForeground}
          className={`${density === "compact" ? "min-h-11 flex-1 py-2 font-sans text-sm" : "min-h-12 flex-1 py-3 font-sans text-base"} text-foreground focus:border-ring ${props.multiline ? "min-h-28" : ""} ${className}`}
          style={
            density === "compact"
              ? [
                  {
                    minHeight: 44,
                    height: props.multiline ? undefined : 44,
                    paddingVertical: 8,
                    fontSize: 14,
                    lineHeight: 20,
                  },
                  style,
                ]
              : style
          }
          onFocus={
            density === "compact"
              ? (event) => {
                  setFocused(true);
                  props.onFocus?.(event);
                }
              : props.onFocus
          }
          onBlur={
            density === "compact"
              ? (event) => {
                  setFocused(false);
                  props.onBlur?.(event);
                }
              : props.onBlur
          }
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            accessibilityState={{ checked: passwordVisible }}
            onPress={() => setPasswordVisible(!passwordVisible)}
            className="min-h-12 min-w-11 items-center justify-center rounded-md focus:ring-2 focus:ring-ring"
          >
            <SymbolView
              name={{
                ios: passwordVisible ? "eye.slash" : "eye",
                android: passwordVisible ? "visibility_off" : "visibility",
                web: passwordVisible ? "visibility_off" : "visibility",
              }}
              size={22}
              tintColor={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          className="font-sans text-sm text-destructive-foreground"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const noticeClasses = {
  info: "bg-info/10 text-info-foreground",
  error: "bg-destructive/10 text-destructive-foreground",
  success: "bg-success/10 text-success-foreground",
};

export function Notice({
  children,
  tone = "info",
}: PropsWithChildren<{ tone?: keyof typeof noticeClasses }>) {
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`rounded-md p-3 font-sans text-sm leading-5 ${noticeClasses[tone]}`}
    >
      {children}
    </Text>
  );
}

export function StatusChip({
  label,
  tone = "info",
}: {
  label: string;
  tone?: "info" | "success" | "warning" | "error";
}) {
  const classes =
    tone === "warning"
      ? "bg-warning/10 text-warning-foreground"
      : noticeClasses[tone];
  return (
    <Text
      className={`self-start overflow-hidden rounded-md px-3 py-2 font-sans text-xs font-bold ${classes}`}
    >
      {label}
    </Text>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  onPress,
}: {
  title: string;
  description: string;
  icon: SymbolViewProps["name"];
  action?: string;
  onPress?: () => void;
}) {
  const { colors } = useUiTheme();
  return (
    <Card className="items-center gap-4 py-8">
      <View className="rounded-lg bg-primary/10 p-4">
        <SymbolView name={icon} size={32} tintColor={colors.primary} />
      </View>
      <Text
        accessibilityRole="header"
        className="text-center font-sans text-xl font-extrabold text-foreground"
      >
        {title}
      </Text>
      <Text className="text-center font-sans text-base leading-6 text-muted-foreground">
        {description}
      </Text>
      {action && onPress ? (
        <View className="w-full">
          <Button title={action} onPress={onPress} />
        </View>
      ) : null}
    </Card>
  );
}
