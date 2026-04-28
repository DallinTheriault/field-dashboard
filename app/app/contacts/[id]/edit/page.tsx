import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ContactEditForm } from "./form";

export default async function ContactEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  return (
    <div className="max-w-2xl">
      <Link
        href={`/app/contacts/${contact.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-bone-400 hover:text-bone-50 mb-4"
      >
        <ArrowLeft size={12} />
        Back to contact
      </Link>

      <div className="mb-6">
        <div className="label-eyebrow mb-1">Edit contact</div>
        <h1 className="text-2xl font-semibold text-bone-50 tracking-tight">
          {contact.name || "Contact"}
        </h1>
      </div>

      <ContactEditForm
        contact={{
          id: contact.id,
          name: contact.name ?? "",
          email: contact.email ?? "",
          address: contact.address ?? "",
          notes: contact.notes ?? "",
        }}
      />
    </div>
  );
}
