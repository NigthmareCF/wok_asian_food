import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, Heading, Notice, Page, palette, ui } from "@/components/ui";
import { ApiError, ClientInvoiceDetails, ClientInvoiceSummary } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function formatMoney(amount: number, currency: string) {
  try { return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha no disponible" : date.toLocaleString("es-GT", { dateStyle: "medium", timeStyle: "short" });
}

export default function InvoicesScreen() {
  const { session, request } = useSession();
  const [invoices, setInvoices] = useState<ClientInvoiceSummary[]>([]);
  const [details, setDetails] = useState<ClientInvoiceDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!session) { setInvoices([]); return; }
    setLoading(true); setError("");
    try { setInvoices(await request<ClientInvoiceSummary[]>("/api/v1/client/invoices")); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos consultar tus facturas."); }
    finally { setLoading(false); }
  }, [request, session]);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function toggleDetails(invoiceId: string) {
    if (details?.invoiceId === invoiceId) { setDetails(null); return; }
    setLoadingDetails(invoiceId); setError("");
    try { setDetails(await request<ClientInvoiceDetails>(`/api/v1/client/invoices/${invoiceId}`)); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "No pudimos consultar el detalle de la factura."); }
    finally { setLoadingDetails(null); }
  }

  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><Page>
    <Heading eyebrow="Facturación">Mis facturas emitidas</Heading>
    <Text style={ui.body}>Aquí aparecen los documentos emitidos asociados a tus pedidos pickup aceptados.</Text>
    {session?.offline ? <Notice>Sin conexión: la consulta requiere conexión con el restaurante.</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    {loading && invoices.length === 0 ? <Card><Text style={ui.body}>Consultando facturas…</Text></Card> : null}
    {!loading && !error && invoices.length === 0 ? <Card>
      <Text style={{ color: palette.ink, fontWeight: "800" }}>Aún no hay facturas emitidas para tus pedidos</Text>
      <Text style={ui.body}>Una solicitud de factura no se emite automáticamente. El equipo debe completar y emitir el documento.</Text>
    </Card> : null}
    {invoices.map((invoice) => <Card key={invoice.invoiceId}>
      <Text style={{ color: palette.ink, fontWeight: "800", fontSize: 17 }}>{invoice.authorizationNumber ?? "Documento emitido"}</Text>
      <Text style={ui.body}>Emitida: {formatDate(invoice.issuedAt)}</Text>
      <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>Total: {formatMoney(invoice.total, invoice.currency)}</Text>
      {invoice.testDocument ? <Notice>Documento de prueba: la emisión fue simulada y no certificada ante SAT.</Notice> : null}
      <Button title={details?.invoiceId === invoice.invoiceId ? "Ocultar detalle" : "Ver detalle"}
        secondary busy={loadingDetails === invoice.invoiceId} onPress={() => void toggleDetails(invoice.invoiceId)} />
      {details?.invoiceId === invoice.invoiceId ? <View style={ui.section}>
        <Text style={ui.body}>A nombre de: {details.customerName ?? "Consumidor final"}</Text>
        {details.customerTaxId ? <Text style={ui.body}>NIT: {details.customerTaxId}</Text> : null}
        <Text style={ui.body}>Subtotal: {formatMoney(details.subtotal, details.currency)}</Text>
        <Text style={ui.body}>Impuestos: {formatMoney(details.taxTotal, details.currency)}</Text>
        {details.items.map((line, index) => <View key={`${line.description}-${index}`} style={ui.row}>
          <Text style={[ui.body, { flex: 1 }]}>{line.quantity} × {line.description}</Text>
          <Text style={[ui.body, { color: palette.ink, fontWeight: "700" }]}>{formatMoney(line.lineTotal, details.currency)}</Text>
        </View>)}
        <Text style={{ color: palette.ink, fontWeight: "800" }}>Total: {formatMoney(details.total, details.currency)}</Text>
      </View> : null}
    </Card>)}
    <Button title="Actualizar facturas" secondary busy={loading} onPress={() => void refresh()} />
  </Page></ScrollView>;
}
