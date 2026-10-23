import { describe, expect, it } from "vitest";
import { billToLines, firstName, invoiceParties, serviceLines, type PartiesInvoice, type PartiesJob } from "./parties";

// TPS-2026-006's shape: Josh (a property manager) pays for work at Ronny's house.
const draft: PartiesInvoice = {
  status: "draft",
  stripe_invoice_id: null,
  job_id: 326,
  bill_to_contact_id: 58,
  customer_name: "Josh Ellis",
  customer_company: "Old Company LLC",
  customer_email: null,
  customer_phone: "+18018976545",
};
const josh = { name: "Josh Ellis", company: "Vista Ventures Realty LLC", address: null, email: null, phone: "+18018976545" };
const job: PartiesJob = {
  job_number: "Job 13",
  work_order_number: null,
  contact_id: 210,
  address: "2830 E Willow Hills Dr, Sandy UT 84093",
  property_id: 91,
  property: { address: "2830 E Willow Hills Dr, Sandy UT 84093", unit: null },
  contact: { name: "Ronny Test" },
};

describe("invoiceParties", () => {
  it("a draft bills the payer as the contact is now, and puts the work at the resident's house", () => {
    const p = invoiceParties(draft, josh, job);
    expect(p.billTo).toEqual({ name: "Josh Ellis", company: "Vista Ventures Realty LLC", address: null, email: null, phone: "+18018976545" });
    expect(billToLines(p.billTo)).toEqual(["Vista Ventures Realty LLC", "(801) 897-6545"]);
    expect(serviceLines(p.service)).toEqual(["2830 E Willow Hills Dr, Sandy UT 84093", "Resident: Ronny"]);
    expect(p.jobNumber).toBe("Job 13");
  });

  it("no Resident line when the payer is the job's own contact; the unit and work order print", () => {
    const own = invoiceParties({ ...draft, bill_to_contact_id: 210 }, { ...josh, name: "Ronny Test", company: null }, {
      ...job,
      work_order_number: " 4417 ",
      property: { address: "12 Main St", unit: "6" },
    });
    expect(serviceLines(own.service)).toEqual(["12 Main St, Unit 6", "Work order #4417"]);
  });

  it("once it went out, it prints what it went out with, not the contact or job as they are now", () => {
    const sent = invoiceParties(
      {
        ...draft,
        status: "sent",
        customer_company: "Vista Ventures Realty LLC",
        customer_address: "PO Box 9, Sandy UT",
        service_address: "2830 E Willow Hills Dr, Sandy UT 84093",
        service_resident: "Ronny",
        work_order_number: null,
        job_number: "Job 13",
      },
      { ...josh, company: "Renamed Realty" },
      { ...job, job_number: "Job 99", property: { address: "Moved St", unit: null } },
    );
    expect(sent.billTo.company).toBe("Vista Ventures Realty LLC");
    expect(sent.billTo.address).toBe("PO Box 9, Sandy UT");
    expect(serviceLines(sent.service)).toEqual(["2830 E Willow Hills Dr, Sandy UT 84093", "Resident: Ronny"]);
    expect(sent.jobNumber).toBe("Job 13");
  });

  it("an invoice sent before the snapshot existed keeps its saved bill-to and reads the job", () => {
    const legacy = invoiceParties({ ...draft, status: "paid" }, { ...josh, company: "Renamed Realty" }, job);
    expect(legacy.billTo.company).toBe("Old Company LLC");
    expect(legacy.jobNumber).toBe("Job 13");
  });

  it("first names", () => {
    expect(firstName("  Ronny  Ortiz ")).toBe("Ronny");
    expect(firstName("")).toBeNull();
  });
});
