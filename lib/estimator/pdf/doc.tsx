import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ClientDocRow } from "../client-rows";

/**
 * Client-facing documents, ported from the standalone estimator.
 * THE RULE: never show labor hours, loaded rate, margin, cost, or modifiers
 * here. Only descriptions, quantities, line prices, and totals.
 * Helvetica is built into react-pdf — no font files, Netlify-function safe.
 */

export interface PdfEntity {
  name: string;
  licenseNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  footerText?: string | null;
  paymentInstructions?: string | null;
  /** Public URL (Supabase Storage) — react-pdf fetches it at render time. */
  logoSrc?: string | null;
  /** Letterhead accent. Defaults to the Sharpline red. */
  accentColor?: string | null;
}

export interface PdfClient {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type PdfRow = ClientDocRow;

// Sampled from the Sharpline logo's actual pixels — keep in sync with
// sharplinepainting.co's --red.
const DEFAULT_ACCENT = "#ff5040";
const INK = "#111111";
const MUTED = "#666666";
const RULE = "#dddddd";

const s = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingHorizontal: 46,
    paddingBottom: 64,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  logo: { maxWidth: 200, maxHeight: 44, objectFit: "contain" },
  entityName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  entityBlock: { textAlign: "right", color: MUTED, lineHeight: 1.35 },
  docTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  docTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  metaBlock: { textAlign: "right", color: MUTED, lineHeight: 1.4 },
  metaStrong: { color: INK, fontFamily: "Helvetica-Bold" },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    marginBottom: 2,
  },
  th: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 6,
  },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 70, color: MUTED },
  colAmt: { width: 80, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 8,
    alignItems: "center",
  },
  totalLabel: { color: MUTED, marginRight: 14 },
  totalValue: { fontSize: 14, fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" },
  grandTotal: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  payBox: {
    marginTop: 18,
    padding: 10,
    borderWidth: 0.5,
    borderColor: RULE,
    borderRadius: 4,
    lineHeight: 1.4,
  },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 46,
    right: 46,
    textAlign: "center",
    color: MUTED,
    fontSize: 8,
    lineHeight: 1.4,
  },
});

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function accentOf(entity: PdfEntity): string {
  return entity.accentColor || DEFAULT_ACCENT;
}

function Letterhead({ entity }: { entity: PdfEntity }) {
  return (
    <>
      <View style={s.headerRow}>
        <View>
          {entity.logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={entity.logoSrc} />
          ) : (
            <Text style={s.entityName}>{entity.name}</Text>
          )}
        </View>
        <View style={s.entityBlock}>
          <Text style={{ color: INK, fontFamily: "Helvetica-Bold" }}>{entity.name}</Text>
          {entity.licenseNumber ? <Text>License {entity.licenseNumber}</Text> : null}
          {entity.address ? <Text>{entity.address}</Text> : null}
          {entity.phone ? <Text>{entity.phone}</Text> : null}
          {entity.email ? <Text>{entity.email}</Text> : null}
        </View>
      </View>
      <View style={{ height: 2.5, backgroundColor: accentOf(entity), marginTop: 10, marginBottom: 18 }} />
    </>
  );
}

function ClientBlock({ client, label }: { client: PdfClient; label: string }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{label}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold" }}>{client.name}</Text>
      {client.address ? <Text style={{ color: MUTED }}>{client.address}</Text> : null}
      {client.phone ? <Text style={{ color: MUTED }}>{client.phone}</Text> : null}
      {client.email ? <Text style={{ color: MUTED }}>{client.email}</Text> : null}
    </View>
  );
}

function RowsTable({ rows }: { rows: PdfRow[] }) {
  return (
    <View style={s.section}>
      <View style={s.tableHead}>
        <Text style={[s.th, s.colDesc]}>Description</Text>
        <Text style={[s.th, s.colQty]}>Qty</Text>
        <Text style={[s.th, s.colAmt]}>Amount</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tr} wrap={false}>
          <Text style={s.colDesc}>{r.description}</Text>
          <Text style={s.colQty}>{r.qtyLabel ?? ""}</Text>
          <Text style={s.colAmt}>{usd(r.amount)}</Text>
        </View>
      ))}
    </View>
  );
}

function Footer({ entity }: { entity: PdfEntity }) {
  if (!entity.footerText) return null;
  return (
    <View style={s.footer} fixed>
      <Text>{entity.footerText}</Text>
    </View>
  );
}

// ---------------- ESTIMATE ----------------

export interface EstimatePdfProps {
  entity: PdfEntity;
  client: PdfClient;
  rows: PdfRow[];
  total: number;
  refNumber: string;
  date: string;
  jobTitle: string;
}

export function EstimatePdf(p: EstimatePdfProps) {
  return (
    <Document title={`${p.refNumber} — ${p.entity.name}`} author={p.entity.name}>
      <Page size="LETTER" style={s.page}>
        <Letterhead entity={p.entity} />
        <View style={s.docTitleRow}>
          <Text style={s.docTitle}>ESTIMATE</Text>
          <View style={s.metaBlock}>
            <Text style={s.metaStrong}>{p.refNumber}</Text>
            <Text>{p.date}</Text>
          </View>
        </View>
        <ClientBlock client={p.client} label="Prepared for" />
        <View style={s.section}>
          <Text style={s.sectionLabel}>Project</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{p.jobTitle}</Text>
        </View>
        <RowsTable rows={p.rows} />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Estimate total</Text>
          <Text style={[s.totalValue, s.grandTotal, { color: accentOf(p.entity) }]}>
            {usd(p.total)}
          </Text>
        </View>
        <Footer entity={p.entity} />
      </Page>
    </Document>
  );
}

// ---------------- INVOICE ----------------

export interface InvoicePdfProps {
  entity: PdfEntity;
  client: PdfClient;
  rows: PdfRow[];
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  total: number;
  invoiceNumber: string;
  issueDate: string;
  dueTerms: string;
  /** Stripe Hosted Invoice URL — rendered as a "Pay online" line when present. */
  payUrl?: string | null;
}

export function InvoicePdf(p: InvoicePdfProps) {
  return (
    <Document title={`Invoice ${p.invoiceNumber}`} author={p.entity.name}>
      <Page size="LETTER" style={s.page}>
        <Letterhead entity={p.entity} />
        <View style={s.docTitleRow}>
          <Text style={s.docTitle}>INVOICE</Text>
          <View style={s.metaBlock}>
            <Text style={s.metaStrong}>{p.invoiceNumber}</Text>
            <Text>Issued {p.issueDate}</Text>
            <Text>Terms: {p.dueTerms}</Text>
          </View>
        </View>
        <ClientBlock client={p.client} label="Bill to" />
        <RowsTable rows={p.rows} />
        {p.taxAmount > 0 ? (
          <>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{usd(p.subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Tax ({p.taxRatePct}%)</Text>
              <Text style={s.totalValue}>{usd(p.taxAmount)}</Text>
            </View>
          </>
        ) : null}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total due</Text>
          <Text style={[s.totalValue, s.grandTotal, { color: accentOf(p.entity) }]}>
            {usd(p.total)}
          </Text>
        </View>
        {p.entity.paymentInstructions || p.payUrl ? (
          <View style={s.payBox}>
            <Text style={s.sectionLabel}>Payment</Text>
            {p.payUrl ? (
              <Text>
                Pay online (card):{" "}
                <Text style={{ color: accentOf(p.entity) }}>{p.payUrl}</Text>
              </Text>
            ) : null}
            {p.entity.paymentInstructions ? (
              <Text>{p.entity.paymentInstructions}</Text>
            ) : null}
          </View>
        ) : null}
        <Footer entity={p.entity} />
      </Page>
    </Document>
  );
}
