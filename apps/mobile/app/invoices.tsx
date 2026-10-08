import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, ClientInvoiceDetails, ClientInvoiceSummary } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function money(value: number, currency: string) {
  return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(value);
}

function date(value: string) {
  return new Date(value).toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

export default function ClientInvoicesScreen() {
  const { session } = useSession();
  return <InvoiceHistory key={session?.email ?? "guest"} />;
}

function InvoiceHistory() {
  const { session, request } = useSession();
  const [invoices, setInvoices] = useState<ClientInvoiceSummary[]>([]);
  const [selected, setSelected] = useState<ClientInvoiceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!session) { setInvoices([]); return; }
    setLoading(true); setError("");
    try { setInvoices(await request<ClientInvoiceSummary[]>("/api/v1/client/invoices")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cargar tus facturas."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function showDetails(invoice: ClientInvoiceSummary) {
    if (selected?.invoiceId === invoice.invoiceId) { setSelected(null); return; }
    setLoadingDetails(invoice.invoiceId); setError("");
    try {
      setSelected(await request<ClientInvoiceDetails>(`/api/v1/client/invoices/${invoice.invoiceId}`));
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos cargar el detalle de la factura."); }
    finally { setLoadingDetails(null); }
  }

  if (!session) return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Tu perfil">Mis facturas</Heading>
    <Card><Notice>Inicia sesión para consultar facturas emitidas a tu cuenta.</Notice></Card>
  </Page></ScrollView>;

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Tu perfil">Mis facturas emitidas</Heading>
    <Text style={ui.body}>Aquí aparecen documentos emitidos asociados únicamente a tus pedidos.</Text>
    <Notice>La API actual muestra datos y números de autorización; todavía no entrega archivos PDF ni XML desde la app.</Notice>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {loading && invoices.length === 0 ? <Notice>Cargando facturas…</Notice> : null}
    {!loading && !error && invoices.length === 0 ? <Card><Notice>Aún no hay facturas emitidas asociadas a tus pedidos.</Notice></Card> : null}
    <View style={ui.section}>{invoices.map((invoice) => <Card key={invoice.invoiceId}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ color: palette.ink, fontSize: 17, fontWeight: "800", flex: 1 }}>{money(invoice.total, invoice.currency)}</Text>
        <Text style={ui.pill}>Emitida</Text>
      </View>
      <Text style={ui.body}>{invoice.customerName} · NIT {invoice.customerTaxId}</Text>
      <Text style={ui.body}>Fecha: {date(invoice.issuedAt)}</Text>
      {invoice.authorizationNumber ? <Text style={ui.body}>Autorización: {invoice.authorizationNumber}</Text> : null}
      {invoice.dteUuid ? <Text selectable style={ui.body}>UUID DTE: {invoice.dteUuid}</Text> : null}
      {invoice.testDocument ? <Notice tone="error">Documento de prueba: no tiene validez fiscal.</Notice> : null}
      <Button title={selected?.invoiceId === invoice.invoiceId ? "Ocultar detalle" : "Ver detalle"} secondary
        busy={loadingDetails === invoice.invoiceId} onPress={() => void showDetails(invoice)} />
      {selected?.invoiceId === invoice.invoiceId ? <View style={ui.section}>
        {selected.testDocument ? <Notice tone="error">El certificador conectado es de prueba. No uses este documento para obligaciones fiscales.</Notice> : null}
        <Text style={ui.body}>Subtotal: {money(selected.subtotal, selected.currency)}</Text>
        <Text style={ui.body}>Impuesto: {money(selected.taxTotal, selected.currency)}</Text>
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Total: {money(selected.total, selected.currency)}</Text>
        {selected.items.map((line, index) => <View key={`${selected.invoiceId}-${index}`} style={ui.row}>
          <Text style={[ui.body, { flex: 1 }]}>{line.quantity} × {line.description}</Text>
          <Text style={ui.body}>{money(line.lineTotal, selected.currency)}</Text>
        </View>)}
      </View> : null}
    </Card>)}</View>
    <Button title="Actualizar facturas" secondary busy={loading} onPress={() => void refresh()} />
  </Page></ScrollView>;
}
