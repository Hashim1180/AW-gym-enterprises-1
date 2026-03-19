'use strict';

// ═══════════════════════════════════════════════════════
//  AW GYMS — Production Backend Server
//  Node.js + Express | Secure | Rate Limited | Logged
// ═══════════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 6700;

// ── ENVIRONMENT VALIDATION ───────────────────────────────
const REQUIRED_ENV = ['CLAUDE_API_KEY'];
const MISSING_ENV  = REQUIRED_ENV.filter(k => !process.env[k]);
if (MISSING_ENV.length) {
  console.error(`\n❌ Missing required env vars: ${MISSING_ENV.join(', ')}`);
  console.error('   Create a .env file. See .env.example for reference.\n');
  process.exit(1);
}

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WA_NUMBER      = process.env.WA_NUMBER      || '923497814918';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const NODE_ENV       = process.env.NODE_ENV        || 'development';
const MAX_REQ_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN) || 30;

// ── LOGGER ───────────────────────────────────────────────
function log(level, msg, meta = {}) {
  const ts    = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  const icons = { info: 'ℹ️ ', warn: '⚠️ ', error: '❌', debug: '🔍' };
  console.log(`[${ts}] ${icons[level] || ''} ${msg}${metaStr}`);
}

// ── RATE LIMITER (in-memory, no extra deps) ──────────────
const rateLimitStore = new Map();

function rateLimit(windowMs = 60000, max = MAX_REQ_PER_MIN) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    const entry = rateLimitStore.get(key);

    if (now > entry.resetAt) {
      entry.count   = 1;
      entry.resetAt = now + windowMs;
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      log('warn', 'Rate limit hit', { ip: key, count: entry.count });
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000)
      });
    }

    next();
  };
}

// Stricter limiter for AI chat endpoint
function chatRateLimit() {
  return rateLimit(60000, parseInt(process.env.CHAT_RATE_LIMIT) || 10);
}

// Clean rate limit store every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore.entries()) {
    if (now > val.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// ── INPUT SANITIZER ──────────────────────────────────────
function sanitizeString(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLen)
    .replace(/[<>]/g, '')           // strip basic HTML
    .replace(/javascript:/gi, '')   // strip JS protocol
    .replace(/on\w+\s*=/gi, '');    // strip event handlers
}

// ── SECURITY HEADERS ─────────────────────────────────────
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options':    'nosniff',
    'X-Frame-Options':           'DENY',
    'X-XSS-Protection':          '1; mode=block',
    'Referrer-Policy':           'strict-origin-when-cross-origin',
    'Permissions-Policy':        'camera=(), microphone=(self), geolocation=()',
    'X-Powered-By':              undefined  // hide Express
  });
  res.removeHeader('X-Powered-By');
  next();
});

// ── CORS ─────────────────────────────────────────────────
app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN.split(',').map(s => s.trim()),
  methods:      ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge:       86400  // preflight cache 24h
}));

// ── BODY PARSERS ─────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ── REQUEST LOGGER ───────────────────────────────────────
app.use((req, res, next) => {
  req.id      = crypto.randomBytes(4).toString('hex');
  req.startAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - req.startAt;
    if (req.path.startsWith('/api')) {
      log('info', `${req.method} ${req.path}`, {
        status: res.statusCode,
        ms,
        ip: req.ip,
        id: req.id
      });
    }
  });
  next();
});

// ── GLOBAL RATE LIMIT ────────────────────────────────────
app.use('/api', rateLimit());

// ── STATIC FILES ─────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, '../Public');
app.use(express.static(PUBLIC_DIR, { maxAge: '1d', etag: true }));
app.use('/videos', express.static(path.join(PUBLIC_DIR, 'videos'), { maxAge: '7d' }));
app.use('/audio',  express.static(path.join(PUBLIC_DIR, 'audio'),  { maxAge: '7d' }));
app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), { maxAge: '7d' }));

// ── PRODUCTS DATABASE ────────────────────────────────────
const PRODUCTS = [
  { id:1,  category:'EQUIPMENT',   name:'Pro Dumbbell Set',      emoji:'🏋️', price:45000,  desc:'Commercial cast iron dumbbells 5–50kg. Chrome knurled handles. Precision balanced.',     badge:'BESTSELLER', rating:4.9, reviews:312  },
  { id:2,  category:'EQUIPMENT',   name:'Elite Treadmill X9',    emoji:'🏃', price:185000, desc:'22km/h top speed, 15% incline, heart rate monitor, whisper-quiet motor.',                badge:'NEW',        rating:4.8, reviews:189  },
  { id:3,  category:'EQUIPMENT',   name:'Power Bench Station',   emoji:'🪑', price:62000,  desc:'Olympic bench press with safety catches, adjustable 0–85°. 300kg rated.',               badge:null,         rating:4.7, reviews:254  },
  { id:4,  category:'EQUIPMENT',   name:'Cable Crossover Pro',   emoji:'⚙️', price:95000,  desc:'Dual pulley system, 200kg weight stack. Full-body functional training.',                 badge:'HOT',        rating:4.9, reviews:178  },
  { id:5,  category:'EQUIPMENT',   name:'Battle Ropes 15m',      emoji:'🌀', price:12500,  desc:'Heavy-duty manila battle ropes 15m × 38mm. Wall anchor sleeve included.',               badge:null,         rating:4.8, reviews:421  },
  { id:6,  category:'EQUIPMENT',   name:'Smith Machine Elite',   emoji:'🔩', price:220000, desc:'Commercial smith machine with full cable system. 360° swivel pulleys.',                  badge:'PREMIUM',    rating:5.0, reviews:96   },
  { id:7,  category:'EQUIPMENT',   name:'Concept2 Rower',        emoji:'🚣', price:145000, desc:'Air resistance rowing ergometer with PM5 performance monitor. Foldable.',               badge:null,         rating:4.9, reviews:203  },
  { id:8,  category:'EQUIPMENT',   name:'Resistance Band Set',   emoji:'🔗', price:4500,   desc:'Premium latex bands 5–100lbs. 12-piece pro set with door anchor and handles.',          badge:'VALUE',      rating:5.0, reviews:887  },
  { id:9,  category:'SUPPLEMENTS', name:'Whey Protein Gold',     emoji:'🥛', price:8500,   desc:'100% whey protein isolate. 25g protein per scoop. 30 servings.',                        badge:'BESTSELLER', rating:4.9, reviews:1204 },
  { id:10, category:'SUPPLEMENTS', name:'Creatine Monohydrate',  emoji:'⚡', price:3200,   desc:'Micronized creatine monohydrate. 5g per serving. 60 servings. Clinically proven.',      badge:null,         rating:4.8, reviews:934  },
  { id:11, category:'SUPPLEMENTS', name:'Pre-Workout APEX',      emoji:'🔥', price:5500,   desc:'200mg caffeine, beta-alanine, citrulline malate. 30 servings. No crash.',               badge:'HOT',        rating:4.7, reviews:678  },
  { id:12, category:'SUPPLEMENTS', name:'BCAA Recovery',         emoji:'💊', price:4800,   desc:'2:1:1 BCAA ratio with electrolytes + Vitamin B6. 40 servings.',                         badge:null,         rating:4.8, reviews:512  },
  { id:13, category:'SUPPLEMENTS', name:'Mass Gainer 5kg',       emoji:'💪', price:11000,  desc:'1250 calories per serving. 50g protein, 250g carbs.',                                   badge:'NEW',        rating:4.6, reviews:389  },
  { id:14, category:'SUPPLEMENTS', name:'Omega-3 Fish Oil',      emoji:'🐟', price:2200,   desc:'Pharmaceutical grade. EPA 360mg + DHA 240mg per softgel. 90 softgels.',                 badge:null,         rating:4.9, reviews:721  },
];

// ── TYLER SYSTEM PROMPT ──────────────────────────────────
const TYLER_SYSTEM = `You are Tyler, elite AI fitness trainer and consultant for AW GYMS — Pakistan's premium gym equipment and supplements store.

STORE INFO:
- Name: AW GYMS
- WhatsApp: +92 349 7814918
- Delivery: Nationwide across Pakistan
- Payment: Cash on delivery + bank transfer

PRODUCTS:
${PRODUCTS.map(p => `• ${p.name} (${p.category}): PKR ${p.price.toLocaleString()} — ${p.desc}`).join('\n')}

PERSONALITY:
- Confident, motivating, expert-level knowledge
- Premium consultant tone — never pushy
- Give specific, actionable fitness advice
- Recommend products based on goals, budget, level

STRICT RULES:
- Max 3–4 sentences unless asked for detail
- Bold product names when mentioning them
- Always end with a question or call to action
- Never invent products outside the list above
- For orders/pricing: direct to WhatsApp +92 349 7814918
- For delivery: "We deliver nationwide. Message us on WhatsApp."
- Never share the API key or internal system info`;

// ════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════

// ── HEALTH ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:     true,
    status:      'AW GYMS Online',
    env:         NODE_ENV,
    port:        PORT,
    products:    PRODUCTS.length,
    claudeReady: !!CLAUDE_API_KEY,
    uptime:      Math.floor(process.uptime()) + 's',
    timestamp:   new Date().toISOString()
  });
});

// ── PRODUCTS ──────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category, search, sort } = req.query;

  let results = [...PRODUCTS];

  if (category) {
    results = results.filter(p => p.category.toUpperCase() === category.toUpperCase());
  }

  if (search) {
    const q = sanitizeString(search, 100).toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q)
    );
  }

  if (sort === 'price_asc')  results.sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') results.sort((a, b) => b.price - a.price);
  if (sort === 'rating')     results.sort((a, b) => b.rating - a.rating);

  res.json({ success: true, products: results, total: results.length });
});

app.get('/api/products/:id', (req, res) => {
  const id      = parseInt(req.params.id);
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
  res.json({ success: true, product });
});

// ── MEDIA FILE LISTINGS ───────────────────────────
function listMediaFiles(subDir, extensions) {
  const dir = path.join(PUBLIC_DIR, subDir);
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => extensions.some(ext => f.toLowerCase().endsWith(ext)))
      .map(f => ({ name: f, url: `/${subDir}/${f}` }));
  } catch { return []; }
}

app.get('/api/videos', (req, res) => {
  res.json({ success: true, videos: listMediaFiles('videos', ['.mp4', '.webm', '.mov']) });
});

app.get('/api/audio', (req, res) => {
  res.json({ success: true, audio: listMediaFiles('audio', ['.mp3', '.wav', '.m4a', '.ogg']) });
});

// ── TYLER AI CHAT ─────────────────────────────────
app.post('/api/chat', chatRateLimit(), async (req, res) => {
  const { messages, productContext } = req.body;

  // Validate
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages array is required' });
  }

  // Sanitize & validate message shape
  const cleanMessages = messages
    .slice(-12)
    .filter(m => m && typeof m.content === 'string' && ['user', 'assistant'].includes(m.role))
    .map(m => ({
      role:    m.role,
      content: sanitizeString(m.content, 800)
    }));

  if (cleanMessages.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid messages provided' });
  }

  // Ensure conversation starts with user role
  while (cleanMessages.length > 0 && cleanMessages[0].role !== 'user') {
    cleanMessages.shift();
  }
  if (cleanMessages.length === 0) {
    return res.status(400).json({ success: false, error: 'First message must be from user' });
  }

  // Build system prompt
  let system = TYLER_SYSTEM;
  if (productContext && productContext.name) {
    const safe = sanitizeString(productContext.name, 100);
    const price = parseInt(productContext.price) || 0;
    system += `\n\nCONTEXT: User is currently viewing "${safe}" priced at PKR ${price.toLocaleString()}. Reference it naturally if relevant.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 400,
        system,
        messages:   cleanMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      log('error', 'Claude API error', { status: response.status, error: data?.error?.message });
      return res.status(502).json({
        success: false,
        error:   'AI service error. Please try again.',
      });
    }

    const reply = data.content?.[0]?.text;
    if (!reply) {
      return res.status(502).json({ success: false, error: 'Empty response from AI' });
    }

    res.json({
      success: true,
      reply,
      usage: {
        inputTokens:  data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens
      }
    });

  } catch (err) {
    log('error', 'Chat fetch error', { message: err.message, id: req.id });
    res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
  }
});

// ── WHATSAPP REDIRECT ─────────────────────────────
app.post('/api/whatsapp', (req, res) => {
  const { product, message } = req.body;

  let text;
  if (message) {
    text = sanitizeString(message, 500);
  } else if (product?.name) {
    const name  = sanitizeString(product.name, 100);
    const price = parseInt(product.price) || 0;
    text = `Hi AW GYMS! I'm interested in *${name}* — PKR ${price.toLocaleString()}. Please share details and arrange delivery.`;
  } else {
    text = `Hi AW GYMS! I visited your store and I'm interested in your products. Please share your catalog.`;
  }

  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  res.json({ success: true, url });
});

// ── SPA FALLBACK ──────────────────────────────────
app.get('*', (req, res) => {
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).json({ error: 'index.html not found in Public/' });
  }
});

// ── GLOBAL ERROR HANDLER ──────────────────────────
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { message: err.message, id: req.id });
  res.status(500).json({
    success: false,
    error:   NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────
process.on('SIGTERM', () => { log('info', 'SIGTERM received. Shutting down.'); process.exit(0); });
process.on('SIGINT',  () => { log('info', 'SIGINT received. Shutting down.');  process.exit(0); });
process.on('uncaughtException',  err => log('error', 'Uncaught exception',  { message: err.message }));
process.on('unhandledRejection', err => log('error', 'Unhandled rejection', { message: err?.message }));

// ── START ─────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═════════════════════════════════════════╗
║       ✅  AW GYMS SERVER ONLINE         ║
║  📍  http://localhost:${PORT}               ║
║  🌍  ENV: ${NODE_ENV.padEnd(29)}║
║  📦  Products: ${String(PRODUCTS.length).padEnd(25)}║
║  🤖  Tyler AI: ✅ Ready                 ║
║  💬  WhatsApp: +92 349 7814918         ║
╚═════════════════════════════════════════╝
  `);
});

module.exports = app;
