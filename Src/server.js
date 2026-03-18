'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 6700;

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const WA_NUMBER = process.env.WA_NUMBER || '923497814918';

if (!CLAUDE_API_KEY) {
  console.warn('⚠️  WARNING: CLAUDE_API_KEY not set in .env');
}

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.static(path.join(__dirname, '../Public')));
app.use('/videos', express.static(path.join(__dirname, '../Public/videos')));
app.use('/audio', express.static(path.join(__dirname, '../Public/audio')));

const PRODUCTS = [
  { id: 1, category: 'EQUIPMENT', name: 'Pro Dumbbell Set', emoji: '🏋️', price: 45000, desc: 'Commercial cast iron dumbbells 5–50kg. Chrome knurled handles.', badge: 'BESTSELLER', rating: 4.9, reviews: 312 },
  { id: 2, category: 'EQUIPMENT', name: 'Elite Treadmill X9', emoji: '🏃', price: 185000, desc: '22km/h top speed, 15% incline, heart rate monitor.', badge: 'NEW', rating: 4.8, reviews: 189 },
  { id: 3, category: 'EQUIPMENT', name: 'Power Bench Station', emoji: '🪑', price: 62000, desc: 'Olympic bench press, 300kg rated.', badge: null, rating: 4.7, reviews: 254 },
  { id: 4, category: 'EQUIPMENT', name: 'Cable Crossover Pro', emoji: '⚙️', price: 95000, desc: 'Dual pulley system, 200kg stack.', badge: 'HOT', rating: 4.9, reviews: 178 },
  { id: 5, category: 'EQUIPMENT', name: 'Battle Ropes 15m', emoji: '🌀', price: 12500, desc: 'Heavy-duty manila ropes.', badge: null, rating: 4.8, reviews: 421 },
  { id: 6, category: 'EQUIPMENT', name: 'Smith Machine Elite', emoji: '🔩', price: 220000, desc: 'Commercial machine with cable system.', badge: 'PREMIUM', rating: 5.0, reviews: 96 },
  { id: 7, category: 'EQUIPMENT', name: 'Concept2 Rower', emoji: '🚣', price: 145000, desc: 'Air resistance with PM5 monitor.', badge: null, rating: 4.9, reviews: 203 },
  { id: 8, category: 'EQUIPMENT', name: 'Resistance Band Set', emoji: '🔗', price: 4500, desc: 'Premium latex bands, 12-piece.', badge: 'VALUE', rating: 5.0, reviews: 887 },
  { id: 9, category: 'SUPPLEMENTS', name: 'Whey Protein Gold', emoji: '🥛', price: 8500, desc: '100% whey isolate, 25g protein.', badge: 'BESTSELLER', rating: 4.9, reviews: 1204 },
  { id: 10, category: 'SUPPLEMENTS', name: 'Creatine Monohydrate', emoji: '⚡', price: 3200, desc: '5g per serving, 60 servings.', badge: null, rating: 4.8, reviews: 934 },
  { id: 11, category: 'SUPPLEMENTS', name: 'Pre-Workout APEX', emoji: '🔥', price: 5500, desc: '200mg caffeine, beta-alanine.', badge: 'HOT', rating: 4.7, reviews: 678 },
  { id: 12, category: 'SUPPLEMENTS', name: 'BCAA Recovery', emoji: '💊', price: 4800, desc: '2:1:1 ratio with electrolytes.', badge: null, rating: 4.8, reviews: 512 },
  { id: 13, category: 'SUPPLEMENTS', name: 'Mass Gainer 5kg', emoji: '💪', price: 11000, desc: '1250 cal/serving, 50g protein.', badge: 'NEW', rating: 4.6, reviews: 389 },
  { id: 14, category: 'SUPPLEMENTS', name: 'Omega-3 Fish Oil', emoji: '🐟', price: 2200, desc: 'EPA 360mg + DHA 240mg, 90 softgels.', badge: null, rating: 4.9, reviews: 721 },
];

const SYSTEM_PROMPT = `You are Tyler, the elite AI fitness trainer for AW GYMS in Pakistan. Store: AW GYMS | WhatsApp: +92 349 7814918. Give expert fitness advice, recommend products, always direct to WhatsApp for purchases. Keep responses 3-4 sentences max.`;

app.get('/api/health', (req, res) => {
  res.json({ status: '✅ Online', port: PORT, products: PRODUCTS.length, claudeApiKey: CLAUDE_API_KEY ? '✅' : '❌' });
});

app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const filtered = category ? PRODUCTS.filter(p => p.category === category) : PRODUCTS;
  res.json({ success: true, products: filtered, total: filtered.length });
});

app.get('/api/products/:id', (req, res) => {
  const product = PRODUCTS.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, product });
});

app.get('/api/videos', (req, res) => {
  const videosDir = path.join(__dirname, '../Public/videos');
  try {
    const videos = fs.existsSync(videosDir) ? fs.readdirSync(videosDir).filter(f => /\.(mp4|webm|mov)$/i.test(f)).map(f => ({ name: f, url: `/videos/${f}` })) : [];
    res.json({ success: true, videos });
  } catch (err) { res.json({ success: true, videos: [] }); }
});

app.get('/api/audio', (req, res) => {
  const audioDir = path.join(__dirname, '../Public/audio');
  try {
    const audio = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => /\.(mp3|wav|m4a|ogg)$/i.test(f)).map(f => ({ name: f, url: `/audio/${f}` })) : [];
    res.json({ success: true, audio });
  } catch (err) { res.json({ success: true, audio: [] }); }
});

app.post('/api/chat', async (req, res) => {
  const { messages, productContext } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Messages required' });
  if (!CLAUDE_API_KEY) return res.status(500).json({ error: 'Claude API key not set' });

  let systemWithContext = SYSTEM_PROMPT;
  if (productContext) systemWithContext += `\nUser viewing: ${productContext.name} (PKR ${productContext.price})`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        system: systemWithContext,
        messages: messages.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'API error' });
    res.json({ success: true, reply: data.content[0]?.text || 'No response', usage: data.usage });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp', (req, res) => {
  const { product, message } = req.body;
  const text = message || (product ? `Hi AW GYMS! I'm interested in ${product.name} — PKR ${product.price?.toLocaleString()}` : `Hi AW GYMS! I'm interested in your products.`);
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  res.json({ success: true, url });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../Public/index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═════════════════════════════════════════╗
║      ✅ AW GYMS SERVER ONLINE ✅        ║
║  📍 http://localhost:${PORT}               ║
║  📦 Products: ${PRODUCTS.length}                       ║
║  🤖 Tyler AI: ${CLAUDE_API_KEY ? '✅ Ready' : '❌ Missing'}            ║
║  💬 WhatsApp: +92 349 7814918          ║
╚═════════════════════════════════════════╝
  `);
});

module.exports = app;
