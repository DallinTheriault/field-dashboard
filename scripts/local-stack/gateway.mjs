// Stand-in for Supabase's Kong gateway: one origin that routes by prefix, so
// supabase-js can use a single project URL. Adds permissive CORS for the app on
// localhost. Usage: node gateway.mjs <port> <restPort> <authPort> <storagePort>
import http from "node:http";

const [port, restPort, authPort, storagePort] = process.argv.slice(2).map(Number);
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
  })
  .listen(port, "127.0.0.1", () => console.log(`gateway on :${port}`));
