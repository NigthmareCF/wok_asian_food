import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError, apiRequest, PublicMenu, PublicMenuItem } from "@/lib/api";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";

function formatPrice(item: PublicMenuItem) {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: item.currency,
  }).format(item.price);
}

export default function MenuScreen() {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<PublicMenu>("/api/v1/public/menu");
      setMenu(result);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiRequest<PublicMenu>("/api/v1/public/menu")
      .then((result) => { if (mounted) setMenu(result); })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el menú.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const categories = menu?.categories ?? [];
  const hasItems = categories.some((category) => category.items.length > 0);

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Catálogo">Menú WOK</Heading>
    {loading ? <Card><Text style={ui.body}>Cargando el menú oficial…</Text></Card> : null}
    {error ? <View style={ui.section}><Notice tone="error">{error}</Notice><Button title="Reintentar" secondary onPress={() => void loadMenu()} /></View> : null}
    {!loading && !error && !hasItems ? <>
      <Card><Text style={{ fontWeight: "800", color: palette.ink, fontSize: 18 }}>El menú se publicará aquí</Text>
        <Text style={ui.body}>Aún no hay platillos publicados. Los productos y precios aparecerán cuando el restaurante cargue su catálogo oficial.</Text>
      </Card>
      <Notice>No mostramos datos de ejemplo como si fueran productos reales.</Notice>
    </> : null}
    {!loading && !error && hasItems ? categories.filter((category) => category.items.length > 0).map((category) =>
      <View key={category.id} style={ui.section}>
        <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 20, fontWeight: "800" }}>{category.name}</Text>
        {category.items.map((item) => <Card key={item.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <Text style={{ flex: 1, color: palette.ink, fontSize: 17, fontWeight: "800" }}>{item.name}</Text>
            <Text style={{ color: palette.red, fontWeight: "800" }}>{formatPrice(item)}</Text>
          </View>
          {item.description ? <Text style={ui.body}>{item.description}</Text> : null}
        </Card>)}
      </View>,
    ) : null}
  </Page></ScrollView>;
}
