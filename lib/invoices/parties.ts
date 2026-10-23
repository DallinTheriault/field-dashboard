import { fmtPhoneDisplay } from "@/lib/sms/phone";

/**
 * Who an invoice bills and where the work was (v104). Bill To is the payer
 * only: the bill-to contact's name, company, mailing address, email and
 * phone. The service block is the job's property (and unit), the resident's
 * first name when they aren't the payer, and the work order number.
 *
 * A draft reads both live (the contact and job as they are now). Once it
 * went out it prints what it went out with; invoices sent before v104 have
 * no service snapshot and read the job as it is.
 */

export type BillTo = {
  name: string;
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
};

export type ServiceBlock = { address: string | null; resident: string | null; workOrder: string | null };

export type InvoiceParties = { billTo: BillTo; service: ServiceBlock | null; jobNumber: string | null };

export type PartiesInvoice = {
  status: string;
  stripe_invoice_id: string | null;
  job_id: number | null;
  bill_to_contact_id: number | null;
  customer_name: string;
  customer_company: string | null;
  customer_address?: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  service_address?: string | null;
  service_resident?: string | null;
  work_order_number?: string | null;
  job_number?: string | null;
};

export type PartiesContact = {
  name: string | null;
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
};

export type PartiesJob = {
  job_number: string | null;
  work_order_number: string | null;
  contact_id: number | null;
  address: string | null;
  property_id: number | null;
  property: { address: string | null; unit: string | null } | null;
  contact: { name: string | null } | null;
};

const clean = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function wentOut(inv: Pick<PartiesInvoice, "status" | "stripe_invoice_id">): boolean {
  return inv.status !== "draft" || !!inv.stripe_invoice_id;
}

/** "Ronny" from "Ronny Ortiz". */
export function firstName(name: string | null | undefined): string | null {
  return clean(name)?.split(/\s+/)[0] ?? null;
}

/** The job's property + unit ("…, Unit 6"), else the address typed on the job. */
export function serviceAddress(job: PartiesJob): string | null {
  const p = job.property_id !== null ? job.property : null;
  const a = clean(p?.address);
  if (a) return clean(p?.unit) ? `${a}, Unit ${clean(p?.unit)}` : a;
  return clean(job.address);
}

function serviceFromJob(job: PartiesJob, billToContactId: number | null): ServiceBlock {
  return {
    address: serviceAddress(job),
    resident: job.contact_id !== null && job.contact_id !== billToContactId ? firstName(job.contact?.name) : null,
    workOrder: clean(job.work_order_number),
  };
}

export function invoiceParties(inv: PartiesInvoice, payer: PartiesContact | null, job: PartiesJob | null): InvoiceParties {
  const out = wentOut(inv);
  const billTo: BillTo =
    !out && inv.bill_to_contact_id !== null && payer
      ? {
          name: clean(payer.name) ?? inv.customer_name,
          company: clean(payer.company),
          address: clean(payer.address),
          email: clean(payer.email),
          phone: clean(payer.phone),
        }
      : {
          name: inv.customer_name,
          company: clean(inv.customer_company),
          address: clean(inv.customer_address),
          email: clean(inv.customer_email),
          phone: clean(inv.customer_phone),
        };
  const stamped = out && (inv.service_address != null || inv.job_number != null);
  if (stamped) {
    return {
      billTo,
      service: { address: clean(inv.service_address), resident: clean(inv.service_resident), workOrder: clean(inv.work_order_number) },
      jobNumber: clean(inv.job_number),
    };
  }
  return {
    billTo,
    service: job ? serviceFromJob(job, inv.bill_to_contact_id) : null,
    jobNumber: job ? clean(job.job_number) : null,
  };
}

/** The Bill To block's lines after the name, as printed: company, address, email, phone. */
export function billToLines(b: BillTo): string[] {
  return [b.company, b.address, b.email, b.phone ? fmtPhoneDisplay(b.phone) : null].filter((x): x is string => !!x);
}

/** The Service address block's lines: address, "Resident: Ronny", "Work order #4417". */
export function serviceLines(s: ServiceBlock | null): string[] {
  if (!s) return [];
  return [s.address, s.resident ? `Resident: ${s.resident}` : null, s.workOrder ? `Work order #${s.workOrder}` : null].filter(
    (x): x is string => !!x,
  );
}

/** Select list for the invoice's job, for invoiceParties. */
export const PARTIES_JOB_SELECT =
  "job_number, work_order_number, contact_id, address, property_id, property:properties(address, unit), contact:contacts!jobs_contact_id_fkey(name)";
/** Select list for the bill-to contact. */
export const PARTIES_PAYER_SELECT = "name, company, address, email, phone";

/** Normalize the embeds PostgREST hands back (object or one-element array). */
export function toPartiesJob(raw: unknown): PartiesJob | null {
  const j = (Array.isArray(raw) ? raw[0] : raw) as (Omit<PartiesJob, "property" | "contact"> & { property: unknown; contact: unknown }) | null;
  if (!j) return null;
  const one = <T,>(v: unknown) => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;
  return { ...j, property: one(j.property), contact: one(j.contact) };
}
