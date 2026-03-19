'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 7700;

// ── ENV VALIDATION ───────────────────────────────
if (!process.env.CLAUDE_API_KEY) {
  console.warn('⚠️  CLAUDE_API_KEY not set — Tyler will use offline scripts only');
}

const CLAUDE_API_KEY  = process.env.CLAUDE_API_KEY || null;
const WA_NUMBER       = process.env.WA_NUMBER       || '923497814918';
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'awgyms2025';
const NODE_ENV        = process.env.NODE_ENV         || 'development';
const ALLOWED_ORIGIN  = process.env.ALLOWED_ORIGIN   || '*';

// ── LOGGER ───────────────────────────────────────
const log = (level, msg, meta = {}) => {
  const icons = { info:'ℹ️ ', warn:'⚠️ ', error:'❌', debug:'🔍' };
  const m = Object.keys(meta).length ? ' '+JSON.stringify(meta) : '';
  console.log(`[${new Date().toISOString()}] ${icons[level]||''}${msg}${m}`);
};

// ── RATE LIMITER ─────────────────────────────────
const RL = new Map();
const rateLimit = (max=30, win=60000) => (req,res,next) => {
  const key = req.ip || 'x'; const now = Date.now();
  const e = RL.get(key);
  if (!e || now > e.r) { RL.set(key,{c:1,r:now+win}); return next(); }
  if (++e.c > max) { res.set('Retry-After',Math.ceil((e.r-now)/1000)); return res.status(429).json({error:'Rate limit exceeded'}); }
  next();
};
setInterval(()=>{ const n=Date.now(); for(const[k,v] of RL) if(n>v.r) RL.delete(k); }, 5*60*1000);

// ── SANITIZE ─────────────────────────────────────
const clean = (s, max=1000) => typeof s==='string' ? s.trim().slice(0,max).replace(/[<>]/g,'').replace(/javascript:/gi,'') : '';

// ── SECURITY HEADERS ─────────────────────────────
app.use((req,res,next)=>{ res.removeHeader('X-Powered-By'); res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','X-XSS-Protection':'1; mode=block'}); next(); });

// ── MIDDLEWARE ───────────────────────────────────
app.use(cors({origin:ALLOWED_ORIGIN==='*'?'*':ALLOWED_ORIGIN.split(','),methods:['GET','POST','PUT','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','X-Admin-Key']}));
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({limit:'2mb',extended:true}));

// ── REQUEST LOGGER ───────────────────────────────
app.use((req,res,next)=>{
  req.id=crypto.randomBytes(4).toString('hex'); req.t=Date.now();
  res.on('finish',()=>{ if(req.path.startsWith('/api')) log('info',`${req.method} ${req.path}`,{s:res.statusCode,ms:Date.now()-req.t,id:req.id}); });
  next();
});

// ── STATIC FILES ─────────────────────────────────
const PUB = path.join(__dirname, '../Public');
app.use(express.static(PUB,{maxAge:'1d',etag:true}));
app.use('/videos', express.static(path.join(PUB,'videos'),{maxAge:'7d'}));
app.use('/audio',  express.static(path.join(PUB,'audio'), {maxAge:'7d'}));
app.use('/images', express.static(path.join(PUB,'images'),{maxAge:'7d'}));

// ── DATA STORE (JSON file-based, no DB needed) ───
const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return getDefaultData(); }
}

function writeData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2),'utf8'); return true; }
  catch(e) { log('error','Write data failed',{e:e.message}); return false; }
}

function getDefaultData() {
  return {
    scripts: [
      {
        id: 's1',
        name: 'Greeting & Welcome',
        scenario: 'greeting',
        triggers: ['hi','hello','hey','salam','assalam','good morning','good evening','welcome'],
        responses: [
          "Welcome to AW GYMS! 💪 I'm Tyler, your fitness consultant. We stock Pakistan's finest gym equipment and supplements. How can I help you today?",
          "Salam! Welcome to AW GYMS — Pakistan's #1 gym store. I'm Tyler. Are you looking for equipment, supplements, or a complete gym setup?",
          "Hey there! Great to have you at AW GYMS! I'm Tyler, your AI trainer. Whether you're building a home gym or need supplements, I've got you covered. What's your goal?",
          "Welcome! AW GYMS has everything you need to forge your legacy. I'm Tyler — ask me anything about our products, pricing, or delivery!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's2',
        name: 'Price Inquiry',
        scenario: 'pricing',
        triggers: ['price','cost','how much','kitna','rate','charges','budget','affordable','cheap','expensive'],
        responses: [
          "Great question! Our range covers all budgets — from resistance bands at PKR 4,500 to our premium Smith Machine at PKR 220,000. What's your budget and fitness goal? I'll find the perfect match for you!",
          "We have options for every budget at AW GYMS! Entry-level equipment starts from PKR 4,500, while commercial-grade machines go up to PKR 220,000. Tell me your budget and I'll build you the perfect setup.",
          "Our pricing is very competitive — PKR 4,500 for bands, PKR 45,000 for dumbbell sets, PKR 185,000 for our elite treadmill. Supplements start from PKR 2,200. What are you looking for?",
          "AW GYMS offers the best price-to-quality ratio in Pakistan. Share your budget with me and I'll recommend exactly what you need to hit your fitness goals!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's3',
        name: 'Delivery Query',
        scenario: 'delivery',
        triggers: ['delivery','deliver','ship','shipping','location','city','lahore','karachi','islamabad','peshawar','multan','rawalpindi','arrive','dispatch','track'],
        responses: [
          "We deliver nationwide across Pakistan! 🇵🇰 Major cities like Lahore, Karachi, Islamabad, Peshawar, and Multan get delivery in 1-3 business days. Remote areas may take 3-5 days. Contact us on WhatsApp for exact delivery timelines!",
          "AW GYMS delivers to every corner of Pakistan! Same-day dispatch for orders placed before 12pm. WhatsApp us at +92 349 7814918 for real-time tracking and delivery updates.",
          "Yes, we deliver to your city! We cover all major Pakistani cities with fast, secure delivery. Heavy equipment is delivered with installation assistance. Message us on WhatsApp to confirm delivery to your area.",
          "Nationwide delivery is our specialty! We've delivered to 100+ cities across Pakistan. Cash on delivery available. Contact us on WhatsApp at +92 349 7814918 to place your order today!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's4',
        name: 'Supplement Advice',
        scenario: 'supplements',
        triggers: ['supplement','protein','creatine','pre workout','bcaa','mass gainer','whey','omega','vitamin','nutrition','diet','gain','muscle'],
        responses: [
          "For muscle gain, I recommend our Whey Protein Gold (25g protein/scoop) + Creatine Monohydrate combo. This is the most evidence-based stack for building size and strength. Both available at AW GYMS!",
          "Great supplement question! Beginners should start with Whey Protein (PKR 8,500) and Omega-3 (PKR 2,200). Intermediate athletes add Creatine (PKR 3,200). Advanced athletes add Pre-Workout APEX (PKR 5,500). Ready to order?",
          "Our BCAA Recovery is perfect for anyone training intensely — it reduces soreness and speeds up recovery significantly. Paired with our Whey Protein Gold, you'll see results within 4-6 weeks!",
          "Supplement advice: For fat loss — Whey Protein + BCAA + Omega-3. For muscle gain — Whey + Creatine + Mass Gainer. For performance — Pre-Workout APEX + BCAA. All available at AW GYMS. WhatsApp to order!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's5',
        name: 'Equipment Recommendation',
        scenario: 'equipment',
        triggers: ['home gym','setup','recommend','suggestion','which','best','treadmill','dumbbell','bench','cable','smith','rower','rope','equipment','machine'],
        responses: [
          "For a complete home gym on a budget, I recommend: Resistance Bands (PKR 4,500) + Dumbbell Set (PKR 45,000) + Power Bench (PKR 62,000). Total: PKR 111,500 for a fully functional home gym!",
          "Top picks this month: 1) Pro Dumbbell Set — unmatched versatility. 2) Cable Crossover Pro — most exercises in one machine. 3) Elite Treadmill X9 — best cardio investment. All in stock, nationwide delivery!",
          "For pure strength training: Smith Machine Elite (PKR 220,000) is the ultimate investment. For a balanced gym: Cable Crossover + Bench Press + Dumbbells is the perfect trio. What's your training style?",
          "My personal recommendation for Pakistani athletes: Start with a Dumbbell Set + Bench Press Station. Add a Treadmill when your budget allows. Supplement with Whey Protein from day one. This is the proven formula!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's6',
        name: 'Order Process',
        scenario: 'ordering',
        triggers: ['order','buy','purchase','how to','payment','cash','cod','bank','transfer','confirm','place order'],
        responses: [
          "Ordering is simple! 1) Browse our collection. 2) Message us on WhatsApp: +92 349 7814918. 3) Confirm your order and address. 4) Pay on delivery (COD) or bank transfer. 5) Receive your order in 1-3 days!",
          "To place your order: Just WhatsApp us at +92 349 7814918 with the product name and your delivery address. We accept Cash on Delivery nationwide. No advance payment required for most products!",
          "Ready to order? It's easy! Tell me which product you want and I'll prepare a WhatsApp message for you. We offer COD (cash on delivery) across Pakistan. Fast, secure, and hassle-free!",
          "The fastest way to order: tap the WhatsApp button on any product, send us a message, and we'll confirm your order within 1 hour. Cash on delivery available. Your equipment will arrive in 1-3 business days!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's7',
        name: 'Workout Plan Request',
        scenario: 'workout',
        triggers: ['workout plan','training plan','exercise','routine','program','beginner','intermediate','advanced','schedule','how to train'],
        responses: [
          "Here's a beginner 3-day plan: Day 1 — Chest/Triceps (Bench Press, Cable Flyes). Day 2 — Back/Biceps (Rows, Curls). Day 3 — Legs/Shoulders (Squats, Press). Rest 4 days. All equipment available at AW GYMS!",
          "For fat loss, try this 4-day split: Day 1&3 — Strength training (our dumbbell set is perfect). Day 2&4 — Cardio (Elite Treadmill X9). Diet: High protein, caloric deficit. Supplement with Whey + Omega-3!",
          "Intermediate 5-day program: Monday-Chest, Tuesday-Back, Wednesday-Shoulders, Thursday-Arms, Friday-Legs. Our Cable Crossover covers 80% of these exercises alone! Want me to go into more detail?",
          "Custom plan for you: Start with compound movements — Bench Press, Rows, Squats, Overhead Press. 3 sets of 8-12 reps each. Progressive overload every week. Add Creatine for faster strength gains. This is Tyler's proven formula!"
        ],
        active: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 's8',
        name: 'Fallback / General',
        scenario: 'fallback',
        triggers: [],
        responses: [
          "Great question! For the most accurate answer, please WhatsApp us directly at +92 349 7814918 — our team responds within minutes. Or ask me about our products, delivery, pricing, or workout plans!",
          "I'm Tyler, AW GYMS AI trainer! I can help with product recommendations, supplement advice, workout plans, pricing, and delivery info. What would you like to know?",
          "Thanks for reaching out to AW GYMS! For specific queries, WhatsApp us at +92 349 7814918. I'm here to help with products, supplements, training plans, and anything fitness-related!",
          "AW GYMS is Pakistan's premier fitness destination! Ask me about our gym equipment, supplements, delivery options, or get a personalized workout plan. How can I help you forge your legacy today?"
        ],
        active: true,
        createdAt: new Date().toISOString()
      }
    ],
    products: [],
    analytics: { totalChats:0, totalOrders:0, topProducts:[], lastUpdated: new Date().toISOString() },
    themes: { default:'luxury' },
    settings: { storeName:'AW GYMS', whatsapp:'923497814918', offlineMode: false }
  };
}

// Initialize data file
if (!fs.existsSync(DATA_FILE)) writeData(getDefaultData());

// ── PRODUCTS ─────────────────────────────────────
const PRODUCTS = [
  {id:1, cat:'EQUIPMENT',   name:'Pro Dumbbell Set',     emoji:'🏋️', price:45000,  desc:'Commercial cast iron dumbbells 5–50kg. Chrome knurled handles. Precision balanced.', badge:'BESTSELLER', rating:4.9, reviews:312},
  {id:2, cat:'EQUIPMENT',   name:'Elite Treadmill X9',   emoji:'🏃', price:185000, desc:'22km/h top speed, 15% incline, heart rate monitor, whisper-quiet motor.',             badge:'NEW',        rating:4.8, reviews:189},
  {id:3, cat:'EQUIPMENT',   name:'Power Bench Station',  emoji:'🪑', price:62000,  desc:'Olympic bench press, adjustable 0–85°. 300kg rated.',                                badge:null,         rating:4.7, reviews:254},
  {id:4, cat:'EQUIPMENT',   name:'Cable Crossover Pro',  emoji:'⚙️', price:95000,  desc:'Dual pulley system, 200kg stack. Full-body functional training.',                     badge:'HOT',        rating:4.9, reviews:178},
  {id:5, cat:'EQUIPMENT',   name:'Battle Ropes 15m',     emoji:'🌀', price:12500,  desc:'Heavy-duty manila ropes 15m × 38mm. Brutal conditioning.',                           badge:null,         rating:4.8, reviews:421},
  {id:6, cat:'EQUIPMENT',   name:'Smith Machine Elite',  emoji:'🔩', price:220000, desc:'Commercial smith machine, 360° pulleys. 300kg rated.',                               badge:'PREMIUM',    rating:5.0, reviews:96},
  {id:7, cat:'EQUIPMENT',   name:'Concept2 Rower',       emoji:'🚣', price:145000, desc:'Air resistance, PM5 monitor. The gold standard.',                                    badge:null,         rating:4.9, reviews:203},
  {id:8, cat:'EQUIPMENT',   name:'Resistance Band Set',  emoji:'🔗', price:4500,   desc:'Premium latex 5–100lbs. 12-piece set.',                                              badge:'VALUE',      rating:5.0, reviews:887},
  {id:9, cat:'SUPPLEMENTS', name:'Whey Protein Gold',    emoji:'🥛', price:8500,   desc:'100% whey isolate. 25g protein per scoop. 30 servings.',                             badge:'BESTSELLER', rating:4.9, reviews:1204},
  {id:10,cat:'SUPPLEMENTS', name:'Creatine Monohydrate', emoji:'⚡', price:3200,   desc:'Micronized, 5g/serving. 60 servings. Clinically proven.',                            badge:null,         rating:4.8, reviews:934},
  {id:11,cat:'SUPPLEMENTS', name:'Pre-Workout APEX',     emoji:'🔥', price:5500,   desc:'200mg caffeine, beta-alanine, citrulline. 30 servings. Zero crash.',                 badge:'HOT',        rating:4.7, reviews:678},
  {id:12,cat:'SUPPLEMENTS', name:'BCAA Recovery',        emoji:'💊', price:4800,   desc:'2:1:1 ratio + electrolytes. 40 servings. Fast recovery.',                            badge:null,         rating:4.8, reviews:512},
  {id:13,cat:'SUPPLEMENTS', name:'Mass Gainer 5kg',      emoji:'💪', price:11000,  desc:'1250 cal/serving. 50g protein, 250g carbs.',                                         badge:'NEW',        rating:4.6, reviews:389},
  {id:14,cat:'SUPPLEMENTS', name:'Omega-3 Fish Oil',     emoji:'🐟', price:2200,   desc:'Pharmaceutical grade. EPA 360mg + DHA 240mg. 90 softgels.',                         badge:null,         rating:4.9, reviews:721},
];

// ── TYLER SYSTEM PROMPT ──────────────────────────
const TYLER_PROMPT = (products, productCtx='') => `You are Tyler, elite AI fitness trainer and consultant for AW GYMS — Pakistan's premium gym store.

STORE: AW GYMS | WhatsApp: +92 349 7814918 | Delivery: Nationwide Pakistan
OWNER CONTACT: WhatsApp for all orders and queries

PRODUCTS:
${products.map(p=>`• ${p.name} (${p.cat}): PKR ${p.price.toLocaleString()} — ${p.desc}`).join('\n')}

PERSONALITY: Confident, motivating, expert-level knowledge. Premium consultant tone.
RULES: Max 3-4 sentences. Bold product names. End with question or CTA. Direct orders to WhatsApp.
${productCtx ? `CONTEXT: User viewing ${productCtx}` : ''}`;

// ── TYLER OFFLINE SCRIPT ENGINE ──────────────────
function tylerOfflineResponse(message) {
  const data = readData();
  const msg  = message.toLowerCase().trim();

  // Match by triggers
  const scripts = data.scripts.filter(s => s.active);
  for (const script of scripts) {
    if (script.triggers.length === 0) continue;
    if (script.triggers.some(t => msg.includes(t))) {
      const responses = script.responses;
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  // Fallback script
  const fallback = scripts.find(s => s.scenario === 'fallback');
  if (fallback && fallback.responses.length) {
    const r = fallback.responses;
    return r[Math.floor(Math.random() * r.length)];
  }

  return "Thanks for contacting AW GYMS! Please WhatsApp us at +92 349 7814918 for immediate assistance. 💪";
}

// ── ADMIN AUTH MIDDLEWARE ────────────────────────
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_PASSWORD) return res.status(401).json({error:'Unauthorized'});
  next();
}

// ════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════

// ── HEALTH ───────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: '✅ AW GYMS Online',
    env: NODE_ENV, port: PORT,
    products: PRODUCTS.length,
    claudeReady: !!CLAUDE_API_KEY,
    offlineScripts: readData().scripts.filter(s=>s.active).length,
    uptime: Math.floor(process.uptime())+'s',
    timestamp: new Date().toISOString()
  });
});

// ── PRODUCTS ─────────────────────────────────────
app.get('/api/products', (req, res) => {
  let results = [...PRODUCTS];
  if (req.query.category) results = results.filter(p=>p.cat.toUpperCase()===req.query.category.toUpperCase());
  if (req.query.search) { const q=clean(req.query.search,100).toLowerCase(); results=results.filter(p=>p.name.toLowerCase().includes(q)||p.desc.toLowerCase().includes(q)); }
  if (req.query.sort==='price_asc')  results.sort((a,b)=>a.price-b.price);
  if (req.query.sort==='price_desc') results.sort((a,b)=>b.price-a.price);
  if (req.query.sort==='rating')     results.sort((a,b)=>b.rating-a.rating);
  res.json({success:true, products:results, total:results.length});
});

app.get('/api/products/:id', (req, res) => {
  const p = PRODUCTS.find(p=>p.id===parseInt(req.params.id));
  if (!p) return res.status(404).json({error:'Not found'});
  res.json({success:true, product:p});
});

// ── MEDIA ─────────────────────────────────────────
const listMedia = (sub, exts) => {
  const dir = path.join(PUB, sub);
  try { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>exts.some(e=>f.toLowerCase().endsWith(e))).map(f=>({name:f,url:`/${sub}/${f}`})) : []; }
  catch { return []; }
};
app.get('/api/videos', (req,res)=>res.json({success:true, videos:listMedia('videos',['.mp4','.webm','.mov'])}));
app.get('/api/audio',  (req,res)=>res.json({success:true, audio:listMedia('audio',['.mp3','.wav','.m4a','.ogg'])}));

// ── TYLER AI CHAT ────────────────────────────────
app.post('/api/chat', rateLimit(15), async (req, res) => {
  const { messages, productContext } = req.body;
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({error:'Messages required'});

  // Update analytics
  const data = readData();
  data.analytics.totalChats = (data.analytics.totalChats||0) + 1;
  data.analytics.lastUpdated = new Date().toISOString();
  writeData(data);

  // Check if offline mode forced or no API key
  if (data.settings?.offlineMode || !CLAUDE_API_KEY) {
    const lastMsg = messages.filter(m=>m.role==='user').pop()?.content || '';
    const reply = tylerOfflineResponse(lastMsg);
    return res.json({ success:true, reply, offline:true });
  }

  // Clean messages
  const clean_msgs = messages.slice(-12)
    .filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string')
    .map(m=>({role:m.role, content:clean(m.content,800)}));

  // Ensure starts with user
  while (clean_msgs.length && clean_msgs[0].role !== 'user') clean_msgs.shift();
  if (!clean_msgs.length) return res.status(400).json({error:'No valid messages'});

  const ctx = productContext?.name ? `"${clean(productContext.name,100)}" at PKR ${parseInt(productContext.price)||0}` : '';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':CLAUDE_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:400, system:TYLER_PROMPT(PRODUCTS,ctx), messages:clean_msgs })
    });

    const d = await response.json();

    if (!response.ok) {
      // Fallback to offline if API fails
      log('warn','Claude API failed, using offline fallback',{status:response.status});
      const lastMsg = clean_msgs.filter(m=>m.role==='user').pop()?.content || '';
      return res.json({ success:true, reply:tylerOfflineResponse(lastMsg), offline:true });
    }

    res.json({ success:true, reply:d.content[0]?.text, usage:d.usage, offline:false });

  } catch (err) {
    log('error','Chat error',{msg:err.message});
    const lastMsg = clean_msgs.filter(m=>m.role==='user').pop()?.content || '';
    res.json({ success:true, reply:tylerOfflineResponse(lastMsg), offline:true });
  }
});

// ── WHATSAPP ─────────────────────────────────────
app.post('/api/whatsapp', (req, res) => {
  const { product, message } = req.body;
  const text = message ? clean(message,500)
    : product?.name ? `Hi AW GYMS! Interested in *${clean(product.name,100)}* — PKR ${parseInt(product.price)||0}. Please arrange delivery.`
    : `Hi AW GYMS! I visited your store and I'm interested in your products. Please share details.`;
  res.json({ success:true, url:`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}` });
});

// ── ANALYTICS ────────────────────────────────────
app.get('/api/analytics', adminAuth, (req,res)=>res.json({success:true, ...readData().analytics}));

app.post('/api/analytics/order', (req, res) => {
  const data = readData();
  data.analytics.totalOrders = (data.analytics.totalOrders||0) + 1;
  if (req.body.productId) {
    const tp = data.analytics.topProducts || [];
    const existing = tp.find(p=>p.id===req.body.productId);
    if (existing) existing.count++;
    else tp.push({id:req.body.productId, name:req.body.productName||'Unknown', count:1});
    tp.sort((a,b)=>b.count-a.count);
    data.analytics.topProducts = tp.slice(0,10);
  }
  data.analytics.lastUpdated = new Date().toISOString();
  writeData(data);
  res.json({success:true});
});

// ════════════════════════════════════════════════
//  ADMIN API — Tyler Script Management
// ════════════════════════════════════════════════

// Get all scripts
app.get('/api/admin/scripts', adminAuth, (req,res) => {
  const data = readData();
  res.json({success:true, scripts:data.scripts});
});

// Get single script
app.get('/api/admin/scripts/:id', adminAuth, (req,res) => {
  const data = readData();
  const s = data.scripts.find(s=>s.id===req.params.id);
  if (!s) return res.status(404).json({error:'Script not found'});
  res.json({success:true, script:s});
});

// Create script
app.post('/api/admin/scripts', adminAuth, (req,res) => {
  const { name, scenario, triggers, responses, active } = req.body;
  if (!name||!scenario||!Array.isArray(responses)||responses.length===0) return res.status(400).json({error:'name, scenario, and responses required'});
  const data = readData();
  const script = {
    id: 's'+Date.now(),
    name: clean(name,100),
    scenario: clean(scenario,50),
    triggers: Array.isArray(triggers) ? triggers.map(t=>clean(t,50).toLowerCase()) : [],
    responses: responses.map(r=>clean(r,1000)),
    active: active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.scripts.push(script);
  writeData(data);
  log('info','Script created',{id:script.id,name:script.name});
  res.status(201).json({success:true, script});
});

// Update script
app.put('/api/admin/scripts/:id', adminAuth, (req,res) => {
  const data = readData();
  const idx = data.scripts.findIndex(s=>s.id===req.params.id);
  if (idx===-1) return res.status(404).json({error:'Script not found'});
  const { name, scenario, triggers, responses, active } = req.body;
  const s = data.scripts[idx];
  if (name)      s.name      = clean(name,100);
  if (scenario)  s.scenario  = clean(scenario,50);
  if (triggers)  s.triggers  = triggers.map(t=>clean(t,50).toLowerCase());
  if (responses) s.responses = responses.map(r=>clean(r,1000));
  if (active !== undefined) s.active = !!active;
  s.updatedAt = new Date().toISOString();
  writeData(data);
  res.json({success:true, script:s});
});

// Delete script
app.delete('/api/admin/scripts/:id', adminAuth, (req,res) => {
  const data = readData();
  const idx = data.scripts.findIndex(s=>s.id===req.params.id);
  if (idx===-1) return res.status(404).json({error:'Script not found'});
  const removed = data.scripts.splice(idx,1)[0];
  writeData(data);
  log('info','Script deleted',{id:removed.id});
  res.json({success:true, deleted:removed.id});
});

// Toggle script active/inactive
app.post('/api/admin/scripts/:id/toggle', adminAuth, (req,res) => {
  const data = readData();
  const s = data.scripts.find(s=>s.id===req.params.id);
  if (!s) return res.status(404).json({error:'Not found'});
  s.active = !s.active; s.updatedAt = new Date().toISOString();
  writeData(data);
  res.json({success:true, active:s.active});
});

// Add single response to script
app.post('/api/admin/scripts/:id/responses', adminAuth, (req,res) => {
  const { response } = req.body;
  if (!response) return res.status(400).json({error:'response required'});
  const data = readData();
  const s = data.scripts.find(s=>s.id===req.params.id);
  if (!s) return res.status(404).json({error:'Not found'});
  s.responses.push(clean(response,1000));
  s.updatedAt = new Date().toISOString();
  writeData(data);
  res.json({success:true, responses:s.responses});
});

// Delete single response
app.delete('/api/admin/scripts/:id/responses/:idx', adminAuth, (req,res) => {
  const data = readData();
  const s = data.scripts.find(s=>s.id===req.params.id);
  if (!s) return res.status(404).json({error:'Not found'});
  const i = parseInt(req.params.idx);
  if (isNaN(i)||i<0||i>=s.responses.length) return res.status(400).json({error:'Invalid index'});
  s.responses.splice(i,1);
  s.updatedAt = new Date().toISOString();
  writeData(data);
  res.json({success:true, responses:s.responses});
});

// ── SETTINGS ─────────────────────────────────────
app.get('/api/admin/settings', adminAuth, (req,res) => res.json({success:true, settings:readData().settings}));
app.put('/api/admin/settings', adminAuth, (req,res) => {
  const data = readData();
  Object.assign(data.settings, req.body);
  writeData(data);
  res.json({success:true, settings:data.settings});
});

// Toggle offline mode
app.post('/api/admin/offline-mode', adminAuth, (req,res) => {
  const data = readData();
  data.settings.offlineMode = !data.settings.offlineMode;
  writeData(data);
  res.json({success:true, offlineMode:data.settings.offlineMode});
});

// ── TEST SCRIPT ──────────────────────────────────
app.post('/api/admin/test-script', adminAuth, (req,res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({error:'message required'});
  const reply = tylerOfflineResponse(message);
  res.json({success:true, reply, message});
});

// ── RESET DATA ───────────────────────────────────
app.post('/api/admin/reset', adminAuth, (req,res) => {
  writeData(getDefaultData());
  res.json({success:true, message:'Data reset to defaults'});
});

// ── SERVE ADMIN PANEL ────────────────────────────
app.get('/admin', (req,res) => {
  const f = path.join(PUB,'admin.html');
  if (fs.existsSync(f)) res.sendFile(f);
  else res.status(404).send('admin.html not found in Public/');
});

// ── SPA FALLBACK ─────────────────────────────────
app.get('*', (req,res) => {
  const f = path.join(PUB,'index.html');
  fs.existsSync(f) ? res.sendFile(f) : res.status(404).json({error:'index.html not found'});
});

// ── ERROR HANDLER ────────────────────────────────
app.use((err,req,res,next) => {
  log('error','Unhandled',{msg:err.message});
  res.status(500).json({error:NODE_ENV==='production'?'Server error':err.message});
});

// ── GRACEFUL SHUTDOWN ────────────────────────────
['SIGTERM','SIGINT'].forEach(sig=>process.on(sig,()=>{log('info',`${sig} shutdown`);process.exit(0)}));
process.on('uncaughtException', err=>log('error','Uncaught',{msg:err.message}));
process.on('unhandledRejection', err=>log('error','Unhandled rejection',{msg:err?.message}));

// ── START ─────────────────────────────────────────
app.listen(PORT,'0.0.0.0',()=>{
  console.log(`
╔══════════════════════════════════════════════╗
║         ✅  AW GYMS SERVER v4.0  ✅          ║
║  📍  http://localhost:${PORT}                  ║
║  🎛️  Admin: http://localhost:${PORT}/admin      ║
║  🤖  Tyler AI: ${CLAUDE_API_KEY?'✅ Claude + Offline':'⚠️  Offline Only'}        ║
║  📜  Scripts: ${readData().scripts.length} loaded                       ║
║  📦  Products: ${PRODUCTS.length}                             ║
║  💬  WhatsApp: +92 349 7814918              ║
╚══════════════════════════════════════════════╝
  `);
});

module.exports = app;
