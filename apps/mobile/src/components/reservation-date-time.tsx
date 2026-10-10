import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Button, useUiTheme } from "./ui";
import {
  addRestaurantDays,
  restaurantLocal,
  restaurantDateLabel,
  restaurantInstant,
  reservationTimeError,
  type ReservationPolicy,
} from "@/lib/slot-time";

function localDay(date: Date) {
  return restaurantLocal(date).slice(0, 10);
}

export function moveReservationWeek(current: number, delta: number) {
  return Math.max(
    0,
    (Number.isFinite(current) ? Math.floor(current) : 0) + delta,
  );
}

export function reservationDays(now: Date, week = 0) {
  const offset = moveReservationWeek(week, 0) * 7;
  return Array.from({ length: 7 }, (_, index) => {
    const day = addRestaurantDays(localDay(now), offset + index);
    return {
      value: day,
      label:
        offset + index === 0
          ? "Hoy"
          : offset + index === 1
            ? "Mañana"
            : restaurantDateLabel(day, { weekday: "short" }),
      date: restaurantDateLabel(day, {
        day: "numeric",
        month: "short",
      }),
    };
  });
}

export function reservationWeekFor(value: string, now: Date) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 0;
  const day = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const today = Date.parse(`${localDay(now)}T00:00Z`);
  return Math.max(0, Math.floor((day - today) / (7 * 24 * 60 * 60 * 1000)));
}

export function selectReservationDay(current: string, day: string) {
  const time = current.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
  return `${day}T${time}`;
}

export function selectReservationTime(
  current: string,
  time: string,
  now: Date,
) {
  const day = current.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? localDay(now);
  return `${day}T${time}`;
}

export function reservationTimeParts(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})$/);
  return {
    hour: Math.max(0, Math.min(23, Number(match?.[1] ?? 0))),
    minute: Math.max(0, Math.min(59, Number(match?.[2] ?? 0))),
  };
}

export function stepReservationTime(
  current: string,
  part: "hour" | "minute",
  delta: number,
  now: Date,
) {
  const time = reservationTimeParts(current);
  time[part] = Math.max(
    0,
    Math.min(part === "hour" ? 23 : 59, time[part] + delta),
  );
  const pad = (value: number) => String(value).padStart(2, "0");
  return selectReservationTime(
    current,
    `${pad(time.hour)}:${pad(time.minute)}`,
    now,
  );
}

export function stepGuests(value: string, delta: number) {
  const current = Number(value);
  return String(
    Math.max(
      1,
      Math.min(50, (Number.isInteger(current) ? current : 2) + delta),
    ),
  );
}

function selectedDateLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "Elige el día de tu visita";
  const day = restaurantDateLabel(match[0], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = value.match(/T(\d{2}:\d{2})$/)?.[1];
  return `${day} · ${time ?? "hora por elegir"}`;
}

const suggestedTimes = ["12:00", "13:00", "18:00", "19:00", "20:00"];

export function ReservationDateTime({
  value,
  onChange,
  disabled,
  title = "¿Cuándo quieres visitarnos?",
  helper = "Selecciona un día y una hora. El restaurante revisará y confirmará tu solicitud.",
  policy,
  earliest,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  title?: string;
  helper?: string;
  policy?: ReservationPolicy;
  earliest?: number;
}) {
  const now = new Date();
  const { colors } = useUiTheme();
  const [week, setWeek] = useState(() => reservationWeekFor(value, now));
  const [focusedDay, setFocusedDay] = useState<string | null>(null);
  const days = reservationDays(now, week);
  const selectedWeek = reservationWeekFor(value, now);
  const time = reservationTimeParts(value);
  const hasTime = /T\d{2}:\d{2}$/.test(value);
  const range = `${restaurantDateLabel(days[0].value, { day: "numeric", month: "short" })} – ${restaurantDateLabel(days[6].value, { day: "numeric", month: "short", year: "numeric" })}`;
  const selectionError =
    policy && hasTime
      ? reservationTimeError(value, now.getTime(), policy)
      : null;
  const tooEarly =
    earliest !== undefined &&
    restaurantInstant(value) !== null &&
    Date.parse(restaurantInstant(value)!) < earliest;

  return (
    <View className="gap-4">
      <Text className="font-sans text-base font-extrabold text-foreground">
        {title}
      </Text>
      <View className="flex-row items-center gap-3">
        <Button
          title="‹"
          secondary
          accessibilityLabel="Ver semana anterior"
          disabled={disabled || week === 0}
          onPress={() => setWeek(moveReservationWeek(week, -1))}
        />
        <Text
          accessibilityLiveRegion="polite"
          className="flex-1 text-center font-sans text-sm font-bold text-foreground"
        >
          {range}
        </Text>
        <Button
          title="›"
          secondary
          accessibilityLabel="Ver semana siguiente"
          disabled={disabled}
          onPress={() => setWeek(moveReservationWeek(week, 1))}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {days.map((day) => {
          const selected = value.startsWith(day.value);
          return (
            <Pressable
              key={day.value}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${day.label}, ${day.date}`}
              accessibilityState={{ selected, disabled }}
              onPress={() => onChange(selectReservationDay(value, day.value))}
              onFocus={() => setFocusedDay(day.value)}
              onBlur={() => setFocusedDay(null)}
              style={({ pressed }) => ({
                opacity: disabled ? 0.5 : 1,
                minHeight: 64,
                minWidth: 80,
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 8,
                borderWidth: 2,
                borderColor:
                  focusedDay === day.value || selected
                    ? colors.primary
                    : colors.border,
                paddingHorizontal: 12,
                paddingVertical: 12,
                backgroundColor: selected
                  ? pressed
                    ? colors.primaryHover
                    : colors.primary
                  : colors.surfaceElevated,
              })}
            >
              <Text
                style={{
                  color: selected ? colors.actionForeground : colors.foreground,
                }}
                className="font-sans text-sm font-bold"
              >
                {day.label}
              </Text>
              <Text
                style={{
                  color: selected
                    ? colors.actionForeground
                    : colors.mutedForeground,
                }}
                className="font-sans text-xs"
              >
                {day.date}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {week > 0 || selectedWeek !== week ? (
        <Button
          title={
            selectedWeek !== week && value
              ? "Ver fecha seleccionada"
              : "Volver a esta semana"
          }
          secondary
          disabled={disabled}
          onPress={() =>
            setWeek(selectedWeek !== week && value ? selectedWeek : 0)
          }
        />
      ) : null}
      <View className="gap-2 rounded-md border border-border bg-surface-elevated p-3">
        <Text
          accessibilityLiveRegion="polite"
          className="font-sans text-sm font-bold text-foreground"
        >
          {selectedDateLabel(value)}
        </Text>
        <Text className="font-sans text-xs leading-5 text-muted-foreground">
          Hora de Guatemala (UTC−6) · usa las flechas para elegir otra semana.
        </Text>
      </View>
      <Text className="font-sans text-sm font-bold text-foreground">
        Horas sugeridas
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {suggestedTimes.map((suggested) => (
          <Button
            key={suggested}
            title={suggested}
            accessibilityLabel={`Sugerir ${suggested}, sujeto a revisión`}
            secondary={!value.endsWith(`T${suggested}`)}
            disabled={
              disabled ||
              Boolean(
                policy &&
                reservationTimeError(
                  selectReservationTime(value, suggested, now),
                  now.getTime(),
                  policy,
                ),
              ) ||
              Boolean(
                earliest !== undefined &&
                Date.parse(
                  restaurantInstant(
                    selectReservationTime(value, suggested, now),
                  ) ?? "",
                ) < earliest,
              )
            }
            onPress={() =>
              onChange(selectReservationTime(value, suggested, now))
            }
          />
        ))}
      </View>
      <Text className="font-sans text-xs leading-5 text-muted-foreground">
        Son sugerencias, no horarios disponibles ni un horario de atención. El
        restaurante evalúa cada solicitud.
      </Text>
      <Text className="font-sans text-sm font-bold text-foreground">
        O elige cualquier hora
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {(["hour", "minute"] as const).map((part) => {
          const label = part === "hour" ? "Hora" : "Minuto";
          const maximum = part === "hour" ? 23 : 59;
          const change = (delta: number) =>
            onChange(stepReservationTime(value, part, delta, now));
          return (
            <View key={part} className="flex-1 gap-2">
              <Text className="text-center font-sans text-sm text-muted-foreground">
                {label} ({part === "hour" ? "00–23" : "00–59"})
              </Text>
              <View className="flex-row items-center justify-center gap-2">
                <Button
                  title="−"
                  secondary
                  accessibilityLabel={`Disminuir ${label.toLowerCase()}`}
                  disabled={disabled || time[part] === 0}
                  onPress={() => change(-1)}
                />
                <Text
                  accessible
                  accessibilityLabel={`${label}: ${hasTime ? String(time[part]).padStart(2, "0") : "por elegir"}`}
                  accessibilityLiveRegion="polite"
                  className="min-w-8 text-center font-sans text-xl font-extrabold text-foreground"
                >
                  {hasTime ? String(time[part]).padStart(2, "0") : "—"}
                </Text>
                <Button
                  title="+"
                  secondary
                  accessibilityLabel={`Aumentar ${label.toLowerCase()}`}
                  disabled={disabled || time[part] === maximum}
                  onPress={() => change(1)}
                />
              </View>
            </View>
          );
        })}
      </View>
      <Text className="font-sans text-sm leading-5 text-muted-foreground">
        {selectionError ??
          (tooEarly
            ? "Elige una hora posterior al tiempo de preparación."
            : helper)}
      </Text>
    </View>
  );
}
