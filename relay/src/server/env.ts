// All configuration comes from environment variables (see .env.example).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'thumbs'), { recursive: true });

/**
 * The secret signs login cookies and encrypts stored platform tokens.
 * If APP_SECRET is not set we generate one once and keep it next to the database,
 * so a first run needs no configuration but tokens still survive restarts.
 */
function loadSecret(): Buffer {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  const file = path.join(dataDir, 'secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
}

const port = Number(process.env.PORT ?? 8787);
const isProd = process.env.NODE_ENV === 'production';

export const env = {
  isProd,
  port,
  host: process.env.HOST ?? (isProd ? '0.0.0.0' : '127.0.0.1'),
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  thumbsDir: path.join(dataDir, 'thumbs'),
  secret: loadSecret(),
  appPassword: process.env.APP_PASSWORD ?? '',
  /** Public address of the app as the browser sees it. OAuth redirects are built from this. */
  publicUrl: (process.env.PUBLIC_URL ?? (isProd ? `http://localhost:${port}` : 'http://localhost:5173')).replace(/\/$/, ''),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_GB ?? 8) * 1024 ** 3,
  google: { clientId: process.env.GOOGLE_CLIENT_ID ?? '', clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '' },
  meta: {
    appId: process.env.META_APP_ID ?? '',
    appSecret: process.env.META_APP_SECRET ?? '',
    graphVersion: process.env.META_GRAPH_VERSION ?? 'v26.0',
  },
};

export const googleConfigured = () => Boolean(env.google.clientId && env.google.clientSecret);
export const metaConfigured = () => Boolean(env.meta.appId && env.meta.appSecret);
