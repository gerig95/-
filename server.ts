import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  const isProd = process.env.NODE_ENV === "production";
  console.log(`[Server] Starting in ${isProd ? 'production' : 'development'} mode`);

  if (isProd) {
    const distPath = path.resolve(__dirname, "dist");
    console.log(`[Server] Serving static files from: ${distPath}`);
    
    // Serve static files first
    app.use(express.static(distPath, { index: false }));
    
    // Fallback for SPA
    app.get("*", (req, res) => {
      const indexPath = path.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Build output not found. Please run build.");
      }
    });
  } else {
    console.log("[Server] Initializing Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    app.use(vite.middlewares);
    
    // Fallback for SPA in dev mode
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(__dirname, "index.html");
        if (!fs.existsSync(indexPath)) {
          return res.status(404).send("index.html not found in root.");
        }
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        if (e instanceof Error) {
          vite.ssrFixStacktrace(e);
        }
        next(e);
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("[Server] Critical failure:", err);
});
