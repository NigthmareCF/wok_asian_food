import { useState } from "react";
import { Linking, Text, View } from "react-native";
import {
  Button,
  Card,
  Heading,
  Notice,
  Page,
  useUiTheme,
} from "@/components/ui";
import { restaurantMapsUrl } from "@/lib/restaurant-location";

export default function LocationScreen() {
  const { colors } = useUiTheme();
  const [error, setError] = useState("");

  async function openMaps() {
    try {
      await Linking.openURL(restaurantMapsUrl);
      setError("");
    } catch {
      setError("No pudimos abrir Google Maps. Intenta de nuevo.");
    }
  }

  return (
    <Page safeTop>
      <Heading eyebrow="WOK ASIAN FOOD">Ubicación</Heading>
      <Card>
        <View className="gap-3">
          <Text
            style={{ color: colors.foreground }}
            className="font-sans text-base font-bold"
          >
            Encuéntranos en Google Maps
          </Text>
          <Text
            style={{ color: colors.mutedForeground }}
            className="font-sans text-sm leading-5"
          >
            Abre el mapa para consultar la ubicación y las indicaciones desde tu
            dispositivo.
          </Text>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            title="Abrir ubicación en Google Maps"
            onPress={() => void openMaps()}
          />
        </View>
      </Card>
    </Page>
  );
}
