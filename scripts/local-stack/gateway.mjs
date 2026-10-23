// Stand-in for Supabase's Kong gateway: one origin that routes by prefix, so
// supabase-js can use a single project URL. Adds permissive CORS for the app on
// localhost. Usage: node gateway.mjs <port> <restPort> <authPort> <storagePort>
//
// Speed work (opt-in, off by default):
//   GATEWAY_LOG=<file>       one line per request: start, end, ms, method, path.
//   GATEWAY_DELAY_MS=<n>     hold every request n ms, like prod's server-to-Supabase hop.
//   GATEWAY_AUTH_DELAY_MS=<n> hold /auth/v1 requests n ms instead (the middleware's
//                            call to Supabase Auth crosses the country on prod).
import http from "node:http";
import { appendFileSync } from "node:fs";

const [port, restPort, authPort, storagePort] = process.argv.slice(2).map(Number);
const LOG = process.env.GATEWAY_LOG;
const DELAY = Number(process.env.GATEWAY_DELAY_MS ?? 0);
const AUTH_DELAY = Number(process.env.GATEWAY_AUTH_DELAY_MS ?? DELAY);
const routes = [
  ["/rest/v1", restPort],
  ["/auth/v1", authPort],
  ["/storage/v1", storagePort],
];

function cors(req, headers) {
  headers["access-control-allow-origin"] = req.headers.origin ?? "*";
  headers["access-control-allow-credentials"] = "true";
  headers["access-control-allow-methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD";
  headers["access-control-allow-headers"] =
    req.headers["access-control-request-headers"] ?? "*";
  headers["access-control-expose-headers"] = "content-range, content-profile, x-total-count";
  return headers;
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors(req, {}));
      return res.end();
    }
    const route = routes.find(([prefix]) => req.url === prefix || req.url.startsWith(prefix + "/") || req.url.startsWith(prefix + "?"));
    if (!route) {
      res.writeHead(404, cors(req, { "content-type": "application/json" }));
      return res.end(JSON.stringify({ message: "no route" }));
    }
    const [prefix, target] = route;
    const path = req.url.slice(prefix.length) || "/";
    const t0 = Date.now();
    if (LOG) res.on("finish", () => appendFileSync(LOG, `[GW] ${t0} ${Date.now()} ${Date.now() - t0}ms ${req.method} ${req.url.slice(0, 160)}\n`));
    const wait = prefix === "/auth/v1" ? AUTH_DELAY : DELAY;
    const go = () => {
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: target,
        path: path.startsWith("/") ? path : "/" + path,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${target}`, "x-forwarded-prefix": prefix },
      },
      (up) => {
        const headers = { ...up.headers };
        for (const k of Object.keys(headers)) if (k.startsWith("access-control-")) delete headers[k];
        res.writeHead(up.statusCode ?? 502, cors(req, headers));
        up.pipe(res);
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(502, cors(req, { "content-type": "application/json" }));
      res.end(JSON.stringify({ message: `upstream ${prefix} unavailable: ${err.code}` }));
    });
    req.pipe(upstream);
    };
    if (wait > 0) {
      req.pause();
      setTimeout(() => {
        req.resume();
        go();
      }, wait);
    } else go();
  })
  .listen(port, "127.0.0.1", () => console.log(`gateway on :${port}`));
