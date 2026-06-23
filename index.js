// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const validUrl = require('valid-url');
const dns = require('dns');

const app = express();
const port = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
app.use(cors({ optionsSuccessStatus: 200 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(`${process.cwd()}/public`));

// ---------- RUTA PRINCIPAL ----------
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// ---------- CONEXIÓN A MONGODB ----------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ Error de conexión:'));
db.once('open', () => console.log('✅ Conectado a MongoDB'));

// ---------- ESQUEMA Y MODELO ----------
const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true },
});

const Url = mongoose.model('Url', urlSchema);

// ---------- FUNCIÓN PARA VALIDAR URL CON DNS ----------
const validateUrlWithDns = (url) => {
  return new Promise((resolve) => {
    const hostname = new URL(url).hostname;
    dns.lookup(hostname, (err) => {
      if (err) {
        resolve(false); // No resuelve el dominio
      } else {
        resolve(true); // Dominio válido
      }
    });
  });
};

// ---------- ENDPOINT: POST /api/shorturl ----------
app.post('/api/shorturl', async (req, res) => {
  const { url } = req.body;

  // 1. Validar que la URL tenga formato correcto (http/https)
  if (!validUrl.isWebUri(url)) {
    return res.json({ error: 'Invalid URL' });
  }

  // 2. Validar que el dominio exista (usando dns.lookup)
  const isValidDns = await validateUrlWithDns(url);
  if (!isValidDns) {
    return res.json({ error: 'Invalid URL' });
  }

  try {
    // 3. Buscar si la URL ya existe en la base de datos
    const existing = await Url.findOne({ original_url: url });
    if (existing) {
      return res.json({
        original_url: existing.original_url,
        short_url: existing.short_url,
      });
    }

    // 4. Obtener el último short_url para asignar el siguiente número
    const last = await Url.findOne().sort({ short_url: -1 });
    const newShortUrl = last ? last.short_url + 1 : 1;

    // 5. Guardar nueva URL
    const newUrl = new Url({
      original_url: url,
      short_url: newShortUrl,
    });
    await newUrl.save();

    res.json({
      original_url: newUrl.original_url,
      short_url: newUrl.short_url,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ENDPOINT: GET /api/shorturl/:short_url ----------
app.get('/api/shorturl/:short_url', async (req, res) => {
  const shortUrl = parseInt(req.params.short_url);
  if (isNaN(shortUrl)) {
    return res.json({ error: 'Invalid short URL' });
  }

  try {
    const found = await Url.findOne({ short_url: shortUrl });
    if (!found) {
      return res.json({ error: 'Short URL not found' });
    }
    res.redirect(found.original_url);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- ENDPOINT DE PRUEBA (opcional) ----------
app.get('/api/hello', (req, res) => {
  res.json({ greeting: 'hello API' });
});

// ---------- INICIAR SERVIDOR ----------
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});