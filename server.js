require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', app: 'mifiado' }));
app.get('/__mifiado_version', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ build: 'qr-approval-v1', root: __dirname }); });

// La URL y la clave publishable/anon son públicas por diseño. Nunca exponer service_role.
app.get('/config.js', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  };
  res.type('application/javascript').send('window.MIFIADO_CONFIG = ' + JSON.stringify(config) + ';');
});

app.use(express.static(publicDir, {
  extensions: ['html'],
  etag: true,
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('service-worker.js') || filePath.endsWith('manifest.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
    if (filePath.endsWith('app.bundle.js')) res.setHeader('Cache-Control', 'no-store');
  }
}));
app.get('*path', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error interno.' });
});
app.listen(port, '0.0.0.0', () => console.log('MiFiado disponible en puerto ' + port + ' desde ' + __dirname));
