// ═══════════════════════════════════════════════════════
//  AW GYMS — Backend Server
//  Node.js + Express | Port 6700
//  Run: node server.js
// ═══════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 6700;

// ── CONFIG ──────────────────────────────────────────────
const CLAUDE_API_KEY = "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";
const WA_NUMBER = "923497814918";

// ── MIDDLEWARE ───────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ── PRODUCTS DATABASE ────────────────────────────────────
const PRODUCTS = [
  // EQUIPMENT
  { id: 1, category: 'EQUIPMENT', name: 'Pro Dumbbell Set', emoji: '🏋️', price: 45000, currency: 'PKR', desc: 'Commercial cast iron dumbbells 5–50kg. Chrome knurled handles. Precision balanced.', img: 'images/dumbbell.jpg', badge: 'BESTSELLER', rating: 4.9, reviews: 312 },
  { id: 2, category: 'EQUIPMENT', name: 'Elite Treadmill X9', emoji: '🏃', price: 185000, currency: 'PKR', desc: '22km/h top speed, 15% incline, heart rate monitor, whisper-quiet motor.', img: 'images/treadmill.jpg', badge: 'NEW', rating: 4.8, reviews: 189 },
  { id: 3, category: 'EQUIPMENT', name: 'Power Bench Station', emoji: '🪑', price: 62000, currency: 'PKR', desc: 'Olympic bench press with safety catches, adjustable 0–85°. 300kg rated.', img: 'images/bench.jpg', badge: null, rating: 4.7, reviews: 254 },
  { id: 4, category: 'EQUIPMENT', name: 'Cable Crossover Pro', emoji: '⚙️', price: 95000, currency: 'PKR', desc: 'Dual pulley system, 200kg weight stack. Full-body functional training.', img: 'images/cable.jpg', badge: 'HOT', rating: 4.9, reviews: 178 },
  { id: 5, category: 'EQUIPMENT', name: 'Battle Ropes 15m', emoji: '🌀', price: 12500, currency: 'PKR', desc: 'Heavy-duty manila battle ropes 15m x 38mm. Anchor sleeve included.', img: 'images/ropes.jpg', badge: null, rating: 4.8, reviews: 421 },
  { id: 6, category: 'EQUIPMENT', name: 'Smith Machine Elite', emoji: '🔩', price: 220000, currency: 'PKR', desc: 'Commercial smith machine with full cable system. 360° swivel pulleys.', img: 'images/smith.jpg', badge: 'PREMIUM', rating: 5.0, reviews: 96 },
  { id: 7, category: 'EQUIPMENT', name: 'Concept2 Rowing Machine', emoji: '🚣', price: 145000, currency: 'PKR', desc: 'Air resistance rowing ergometer. Performance monitor PM5. Foldable frame.', img: 'images/rowing.jpg', badge: null, rating: 4.9, reviews: 203 },
  { id: 8, category: 'EQUIPMENT', name: 'Resistance Band Set', emoji: '🔗', price: 4500, currency: 'PKR', desc: 'Premium latex bands 5–100lbs. 12-piece pro set. Door anchor + handles.', img: 'images/bands.jpg', badge: 'VALUE', rating: 5.0, reviews: 887 },
  // SUPPLEMENTS
  { id: 9, category: 'SUPPLEMENTS', name: 'Whey Protein Gold', emoji: '🥛', price: 8500, currency: 'PKR', desc: '100% whey protein isolate. 25g protein per scoop. 30 servings. Multiple flavors.', img: 'images/whey.jpg', badge: 'BESTSELLER', rating: 4.9, reviews: 1204 },
  { id: 10, category: 'SUPPLEMENTS', name: 'Creatine Monohydrate', emoji: '⚡', price: 3200, currency: 'PKR', desc: 'Micronized creatine monohydrate. 5g per serving. 60 servings. Pure unflavored.', img: 'images/creatine.jpg', badge: null, rating: 4.8, reviews: 934 },
  { id: 11, category: 'SUPPLEMENTS', name: 'Pre-Workout APEX', emoji: '🔥', price: 5500, currency: 'PKR', desc: '200mg caffeine, beta-alanine, citrulline. 30 servings. Explosive energy.', img: 'images/preworkout.jpg', badge: 'HOT', rating: 4.7, reviews: 678 },
  { id: 12, category: 'SUPPLEMENTS', name: 'BCAA Recovery', emoji: '💊', price: 4800, currency: 'PKR', desc: '2:1:1 BCAA ratio. Electrolytes + Vitamin B6. 40 servings. Tropical flavor.', img: 'images/bcaa.jpg', badge: null, rating: 4.8, reviews: 512 },
  { id: 13, category: 'SUPPLEMENTS', name: 'Mass Gainer 5kg', emoji: '💪', price: 11000, currency: 'PKR', desc: '1250 calories per serving. 50g protein. 250g carbs. Chocolate & vanilla.', img: 'images/mass.jpg', badge: 'NEW', rating: 4.6, reviews: 389 },
  { id: 14, category: 'SUPPLEMENTS', name: 'Omega-3 Fish Oil', emoji: '🐟', price: 2200, currency: 'PKR', desc: 'Pharmaceutical grade omega-3. EPA 360mg + DHA 240mg. 90 softgels.', img: 'images/omega.jpg', badge: null, rating: 4.9, reviews: 721 },
];

const SYSTEM_PROMPT = `You are Tyler, the elite AI fitness trainer and sales consultant for AW GYMS — a premium gym equipment and supplements store in Pakistan.

STORE: AW GYMS | WhatsApp: +92 349 7814918
OWNER: Available on WhatsApp for orders and queries

PRODUCTS AVAILABLE:
${PRODUCTS.map(p => `- ${p.name} (${p.category}): PKR ${p.price.toLocaleString()} — ${p.desc}`).join('\n')}

YOUR PERSONALITY:
- Confident, motivating, expert-level fitness knowledge
- Speak like a premium brand consultant — never pushy, always helpful
- Give specific, actionable fitness advice
- Recommend products based on user goals, budget, experience level
- For purchases always direct to WhatsApp: +92 349 7814918

RULES:
- Responses max 3-4 sentences unless asked for detail
- Use bold for product names
- Always end with a question or CTA
- You are an affiliate marketer earning commission
- Never make up products not in the list
- If asked about delivery: "We deliver nationwide in Pakistan. Contact us on WhatsApp."
- If asked about price negotiation: "Message us on WhatsApp for special deals."`;

// ── ROUTES ───────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'AW GYMS Server Online',
    port: PORT,
    products: PRODUCTS.length,
    timestamp: new Date().toISOString()
  });
});

// Get all products
app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const filtered = category ? PRODUCTS.filter(p => p.category === category) : PRODUCTS;
  res.json({ success: true, products: filtered, total: filtered.length });
});

// Get single product
app.get('/api/products/:id', (req, res) => {
  const product = PRODUCTS.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, product });
});

// Tyler AI Chat — proxies to Claude
app.post('/api/chat', async (req, res) => {
  const { messages, productContext } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  let systemWithContext = SYSTEM_PROMPT;
  if (productContext) {
    systemWithContext += `\n\nCURRENT USER IS VIEWING: ${productContext.name} at PKR ${productContext.price?.toLocaleString()}. Mention it naturally if relevant.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: systemWithContext,
        messages: messages.slice(-10)
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Claude API error:', data.error);
      return res.status(500).json({ error: 'AI service error', detail: data.error.message });
    }

    res.json({
      success: true,
      reply: data.content[0].text,
      usage: data.usage
    });

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
});

// WhatsApp redirect with tracking
app.post('/api/whatsapp', (req, res) => {
  const { product, message } = req.body;
  const text = message || (product
    ? `Hi AW GYMS! I'm interested in the *${product.name}* — PKR ${product.price?.toLocaleString()}. Please provide more details.`
    : `Hi AW GYMS! I visited your store and I'm interested in your products.`);
  const url = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
  res.json({ success: true, url });
});

// ── START ─────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════╗
║         AW GYMS SERVER ONLINE         ║
║  http://localhost:${PORT}               ║
║  Products loaded: ${PRODUCTS.length}                  ║
║  Tyler AI: Ready                      ║
╚═══════════════════════════════════════╝
  `);
});
