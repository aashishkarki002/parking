/**
 * Production server with rate limiting so the frontend doesn't go down
 * under heavy/bot traffic. Serves the Vite build (run: npm run build && npm start).
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

const app = express();

// So rate limit sees real client IP when behind Nginx/Apache/load balancer
app.set('trust proxy', 1);

// Rate limit: protect this Node process from too many requests (same idea as Next.js middleware)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500,            // parking app: allow up to ~500 req/min per IP (legitimate traffic)
  message: { error: 'Too Many Requests', message: 'Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// The service worker and manifest must always be revalidated, otherwise a
// cached sw.js keeps serving the previous build's precache forever.
app.use((req, res, next) => {
  if (/^\/(sw\.js|registerSW\.js|manifest\.webmanifest|workbox-.*\.js)$/.test(req.path)) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

// Static files from Vite build. /assets/* filenames are content-hashed, so they
// can be cached immutably; everything else falls back to revalidation.
app.use(
  express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// SPA: all other routes serve index.html (no cache so users get latest after deploy)
app.get('*', (_req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = process.env.PORT || 5173;
app.listen(port, () => {
  console.log(`> react-parking with rate limit on http://localhost:${port}`);
});
