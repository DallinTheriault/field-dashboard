import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  EstimatePdf,
  InvoicePdf,
  type EstimatePdfProps,
  type InvoicePdfProps,
} from "./doc";

// Route handlers are .ts (no JSX) — createElement bridges to the components.
type PdfElement = ReactElement<DocumentProps>;

export function renderEstimatePdf(props: EstimatePdfProps): Promise<Buffer> {
  return renderToBuffer(createElement(EstimatePdf, props) as unknown as PdfElement);
}

export function renderInvoicePdf(props: InvoicePdfProps): Promise<Buffer> {
  return renderToBuffer(createElement(InvoicePdf, props) as unknown as PdfElement);
}
