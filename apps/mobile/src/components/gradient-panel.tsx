import { PropsWithChildren } from "react";
import { View } from "react-native";
import { darkTokens } from "@/theme/tokens";

const start = darkTokens["--surface-elevated"].split(" ").map(Number);
const end = darkTokens["--surface"].split(" ").map(Number);
const bands = Array.from({ length: 32 }, (_, index) => {
  const channels = start.map((channel, offset) =>
    Math.round(channel + ((end[offset] - channel) * index) / 31),
  );
  return `rgb(${channels.join(", ")})`;
});
const warmBands = Array.from({ length: 32 }, (_, index) => {
  const warmStart = [81, 44, 35];
  const warmEnd = [29, 24, 25];
  return `rgb(${warmStart.map((channel, offset) => Math.round(channel + ((warmEnd[offset] - channel) * index) / 31)).join(", ")})`;
});
const scrimBands = Array.from(
  { length: 32 },
  (_, index) => `rgba(18, 18, 20, ${index / 31})`,
);

// Static native Views avoid experimental gradient APIs and respect reduced motion.
export function GradientPanel({
  children,
  variant = "neutral",
  fill = false,
}: PropsWithChildren<{
  variant?: "neutral" | "warm" | "scrim";
  fill?: boolean;
}>) {
  const selectedBands =
    variant === "warm" ? warmBands : variant === "scrim" ? scrimBands : bands;
  return (
    <View
      className={
        fill
          ? "absolute inset-0 overflow-hidden"
          : "overflow-hidden rounded-lg border border-border bg-surface"
      }
    >
      <View
        pointerEvents="none"
        accessible={false}
        className={`absolute inset-0 ${variant === "scrim" ? "flex-col" : "flex-row"}`}
      >
        {selectedBands.map((color, index) => (
          <View key={index} style={{ flex: 1, backgroundColor: color }} />
        ))}
      </View>
      <View className={fill ? "flex-1" : "gap-5 p-5 sm:p-8"}>{children}</View>
    </View>
  );
}
