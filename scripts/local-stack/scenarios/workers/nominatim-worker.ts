// One "server": looks up addresses through the app's geocoder with the
// shared Nominatim turn. geo-throttle.mjs runs two of these at once.
import { createClient } from "@supabase/supabase-js";
import { lookupAddress } from "../../../../lib/mileage/geo";
import { sharedNominatimTurn } from "../../../../lib/mileage/throttle";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const turn = sharedNominatimTurn(admin);
for (const address of process.argv.slice(2)) {
  const g = await lookupAddress(address, turn);
  console.log(JSON.stringify({ address, status: g.status, source: g.status === "ok" ? g.source : null }));
}
