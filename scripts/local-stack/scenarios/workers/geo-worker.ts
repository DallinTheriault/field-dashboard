// One "server": places addresses and routes to them through the app's own
// geo code, taking turns shared through the database. geo-throttle.mjs runs
// two of these at once. Usage: geo-worker.ts <budget ms> <address>...
import { createClient } from "@supabase/supabase-js";
import { drivingMiles, lookupAddress } from "../../../../lib/mileage/geo";
import { sharedTurn } from "../../../../lib/mileage/throttle";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const [budget, ...addresses] = process.argv.slice(2);
const started = Date.now();
const turn = sharedTurn(admin, started + Number(budget));
const from = { lat: 40.39, lon: -111.85 };
for (const address of addresses) {
  const g = await lookupAddress(address, turn);
  const r = g.status === "ok" ? await drivingMiles(from, g.point, turn) : null;
  console.log(JSON.stringify({
    address,
    status: g.status,
    source: g.status === "ok" ? g.source : null,
    route: r === null ? null : typeof r === "string" ? r : r.source,
  }));
}
console.log(JSON.stringify({ elapsed: Date.now() - started }));
