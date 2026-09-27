/**
 * A tiny static file server for the exported site (`out/`), used by the
 * browser tests. No dependencies: the site is plain files.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const port = Number(process.argv[2] ?? 3262);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const p = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, "");
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("outside");
    let s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = join(file, "index.html");
    else if (!s) file = (await stat(file + ".html").catch(() => null)) ? file + ".html" : join(root, "404.html");
    const body = await readFile(file);
    res.writeHead(file.endsWith("404.html") && !p.endsWith("404.html") ? 404 : 200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, () => console.log(`serving out/ on http://localhost:${port}`));
