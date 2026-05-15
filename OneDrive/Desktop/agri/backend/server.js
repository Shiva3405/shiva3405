const express = require('express');
const cors = require('cors');
const fetch = global.fetch || require('node-fetch');
require('dotenv').config();
const mongoose = require('mongoose')
const http = require('http')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const { Product, Order, ChatMessage, initSampleProducts } = require('./models')
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const { Server } = require('socket.io')

// ensure uploads directories
const uploadsDir = path.join(__dirname, 'uploads')
const imagesDir = path.join(uploadsDir, 'images')
const videosDir = path.join(uploadsDir, 'videos')
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir)
if(!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir)
if(!fs.existsSync(videosDir)) fs.mkdirSync(videosDir)

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, imagesDir) },
  filename: function (req, file, cb) { cb(null, Date.now() + '_' + file.originalname) }
})
const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, videosDir) },
  filename: function (req, file, cb) { cb(null, Date.now() + '_' + file.originalname) }
})

const uploadImage = multer({ storage: imageStorage })
const uploadVideo = multer({ storage: videoStorage })

// In-memory chat messages (fallback)
const chatMessages = []

const { getRecommendation, calculateDosage } = require('./cropGuide')

const app = express();
app.use(cors());
app.use(express.json());
// serve uploads
app.use('/uploads', express.static(uploadsDir))

// create HTTP server for socket.io
const server = http.createServer(app)

// S3 client if configured
let s3Client = null
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.S3_BUCKET) {
  s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
}

let io = null

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Connect to MongoDB if URI provided, otherwise run in-memory
const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI
let dbConnected = false
if(MONGO){
  mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true }).then(async ()=>{
    console.log('MongoDB connected')
    dbConnected = true
    try{ await initSampleProducts() }catch(e){ console.error('init sample failed', e) }
  }).catch(err=>{
    console.error('mongo connect failed', err)
  })
}

// In-memory fallback products (used when no DB)
const products = [
  { id: 'p1', name: 'Organic NPK 20-20-20', price: 1200, stock: 25, unit: 'kg', category: 'Fertilizer', image: '', description: 'Balanced NPK for general crops' },
  { id: 'p2', name: 'Liquid Growth Tonic', price: 450, stock: 5, unit: 'L', category: 'Liquid', image: '', description: 'Micronutrient rich tonic' },
  { id: 'p3', name: 'Bio Pesticide', price: 700, stock: 0, unit: 'L', category: 'Pesticide', image: '', description: 'Eco-friendly pest control' }
]

app.get('/api/products', async (req, res) => {
  if(dbConnected){
    const list = await Product.find().lean()
    return res.json(list)
  }
  res.json(products)
})

app.get('/api/products/:id', async (req, res) => {
  if(dbConnected){
    const p = await Product.findById(req.params.id).lean()
    if(!p) return res.status(404).json({error:'not found'})
    return res.json(p)
  }
  const p = products.find(x => x.id === req.params.id)
  if(!p) return res.status(404).json({error:'not found'})
  res.json(p)
})

// Admin: update stock
app.put('/api/products/:id/stock', async (req, res) => {
  const { stock } = req.body
  if(typeof stock !== 'number') return res.status(400).json({error:'stock must be number'})
  if(dbConnected){
    const p = await Product.findByIdAndUpdate(req.params.id, { stock }, { new: true }).lean()
    if(!p) return res.status(404).json({error:'not found'})
    return res.json(p)
  }
  const idx = products.findIndex(p=>p.id===req.params.id)
  if(idx===-1) return res.status(404).json({error:'not found'})
  products[idx].stock = stock
  res.json(products[idx])
})

app.get('/api/weather', async (req, res) => {
  const { lat = '17.3850', lon = '78.4867' } = req.query;
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    // return mock data when API key is not configured
    return res.json({
      temp: 30,
      humidity: 70,
      wind_speed: 3.2,
      rain: false,
      pop: 0
    });
  }
  try {
    // Use One Call API to get current + hourly probabilities
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=minutely,alerts&appid=${key}`;
    const r = await fetch(url);
    const data = await r.json();

    const current = data.current || {};
    // compute rain in last hour (if present) and probability of precipitation (pop) from next 12 hours
    const rainLastHour = (current.rain && (current.rain['1h'] || 0)) || 0;
    const hourly = data.hourly || [];
    const next12 = hourly.slice(0, 12);
    const popMax = next12.reduce((m, h) => Math.max(m, (h.pop || 0)), 0);

    res.json({
      temp: current.temp,
      humidity: current.humidity,
      wind_speed: current.wind_speed,
      rain_1h: rainLastHour,
      pop_next12_max: popMax,
      raw: data
    });
  } catch (err) {
    res.status(500).json({ error: 'weather fetch failed', detail: err.message });
  }
});

// Forecast endpoint returns short hourly pop array for next hours
app.get('/api/weather/forecast', async (req, res) => {
  const { lat = '17.3850', lon = '78.4867', hours = 12 } = req.query;
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return res.json({ hourly: [] });
  try {
    const url = `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&units=metric&exclude=current,minutely,alerts&appid=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    const hourly = (data.hourly || []).slice(0, Math.min(Number(hours), 48)).map(h=>({dt: h.dt, pop: h.pop, temp: h.temp}));
    res.json({ hourly });
  } catch (err) {
    res.status(500).json({ error: 'forecast fetch failed', detail: err.message });
  }
});

// Create order and decrement stock atomically when possible
app.post('/api/orders', async (req, res) => {
  const { customer, items, paymentMethod = 'COD' } = req.body
  if(!items || !Array.isArray(items) || items.length===0) return res.status(400).json({ error: 'no items' })

  if(dbConnected){
    const session = await mongoose.startSession()
    session.startTransaction()
    try{
      // decrement stock for each item
      for(const it of items){
        const updated = await Product.findOneAndUpdate(
          { _id: it.id, stock: { $gte: it.qty } },
          { $inc: { stock: -it.qty } },
          { session, new: true }
        )
        if(!updated){
          throw new Error(`insufficient stock for ${it.id}`)
        }
      }

      const total = items.reduce((s,i)=> s + (i.price||0) * (i.qty||1), 0)
      const order = await Order.create([{
        items: items.map(i=>({ productId: i.id, name: i.name, price: i.price, qty: i.qty })),
        customer, total, paymentMethod
      }], { session })

      await session.commitTransaction()
      session.endSession()
      res.json({ orderId: order[0]._id, status: 'created' })
    }catch(err){
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ error: err.message })
    }
  } else {
    // in-memory fallback: check and decrement
    try{
      for(const it of items){
        const idx = products.findIndex(p=>p.id===it.id)
        if(idx===-1) throw new Error(`product ${it.id} not found`)
        if(products[idx].stock < it.qty) throw new Error(`insufficient stock for ${it.id}`)
      }
      // decrement
      for(const it of items){
        const idx = products.findIndex(p=>p.id===it.id)
        products[idx].stock -= it.qty
      }
      const total = items.reduce((s,i)=> s + (i.price||0) * (i.qty||1), 0)
      const orderId = `order_${Date.now()}`
      // store orders in memory? For now just return created
      return res.json({ orderId, status: 'created' })
    }catch(err){
      return res.status(400).json({ error: err.message })
    }
  }
})

// Plant disease detection (stub)
app.post('/api/detect-disease', uploadImage.single('image'), async (req, res) => {
  try{
    if(!req.file) return res.status(400).json({ error: 'no file' })
    let filePath = `/uploads/images/${req.file.filename}`

    const localPath = path.join(imagesDir, req.file.filename)
    const buffer = fs.readFileSync(localPath)

    // If HF configured, call inference API using local buffer
    let disease='Unknown', confidence=0
    if(process.env.HF_API_KEY && process.env.HF_MODEL){
      try{
        const model = process.env.HF_MODEL
        const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/octet-stream' },
          body: buffer
        })
        const j = await r.json()
        if(Array.isArray(j) && j.length>0){
          disease = j[0].label || 'Unknown'
          confidence = j[0].score || 0
        }else if(j && j.error){
          console.error('hf error', j.error)
        }
      }catch(e){ console.error('hf call failed', e) }
    }

    // If S3 configured, upload and remove local file
    if(s3Client){
      const key = `images/${req.file.filename}`
      try{
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: req.file.mimetype }))
        filePath = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
        // remove local file
        try{ fs.unlinkSync(localPath) }catch(e){}
      }catch(e){ console.error('s3 upload failed', e) }
    }

    // fallback stub when HF not configured
    if(!disease || disease==='Unknown'){
      const name = req.file.originalname.toLowerCase()
      disease = 'Healthy'
      confidence = 0.95
      if(name.includes('blight')){ disease = 'Leaf Blight'; confidence = 0.92 }
      else if(name.includes('mildew')){ disease = 'Powdery Mildew'; confidence = 0.88 }
      else if(name.includes('yellow')){ disease = 'Nutrient Deficiency (Nitrogen)'; confidence = 0.85 }
      else {
        const options = [
          ['Leaf Blight',0.8], ['Powdery Mildew',0.76], ['Pest Attack',0.7], ['Nutrient Deficiency',0.65], ['Healthy',0.96]
        ]
        const pick = options[Math.floor(Math.random()*options.length)]
        disease = pick[0]
        confidence = pick[1]
      }
    }

    // map to recommended products (by product id)
    const recommended = []
    if(disease.toLowerCase().includes('blight') || disease.toLowerCase().includes('pest')) recommended.push('p3')
    if(disease.toLowerCase().includes('deficien')) recommended.push('p1')
    if(disease.toLowerCase().includes('healthy')) recommended.push('p2')

    res.json({ file: filePath, disease, confidence, recommended })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

// Video upload
app.post('/api/videos', uploadVideo.single('video'), async (req, res)=>{
  try{
    if(!req.file) return res.status(400).json({ error: 'no video' })
    let url = `/uploads/videos/${req.file.filename}`
    if(s3Client){
      const body = fs.readFileSync(path.join(videosDir, req.file.filename))
      const key = `videos/${req.file.filename}`
      try{
        await s3Client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: req.file.mimetype }))
        url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
        try{ fs.unlinkSync(path.join(videosDir, req.file.filename)) }catch(e){}
      }catch(e){ console.error('s3 video upload failed', e) }
    }
    res.json({ url, filename: req.file.filename })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

app.get('/api/videos', (req, res)=>{
  try{
    const files = fs.readdirSync(videosDir).map(f=> ({ url: `/uploads/videos/${f}`, filename: f }))
    res.json(files)
  }catch(err){ res.status(500).json({ error: err.message }) }
})

// Chat endpoints (persist to Mongo when available)
app.get('/api/chat/messages', async (req, res)=>{
  if(dbConnected){
    const msgs = await ChatMessage.find().sort({ ts: 1 }).lean()
    return res.json(msgs)
  }
  res.json(chatMessages.slice(-200))
})

app.post('/api/chat/messages', async (req, res)=>{
  const { name = 'Farmer', text } = req.body
  if(!text) return res.status(400).json({ error: 'text required' })
  const m = { name, text, ts: new Date() }
  if(dbConnected){
    const saved = await ChatMessage.create(m)
    if(io) io.emit('message', saved)
    return res.json(saved)
  }
  m.id = Date.now(); chatMessages.push(m)
  if(io) io.emit('message', m)
  res.json(m)
})

// Crop guide recommendation
app.get('/api/crop-guide', (req, res) => {
  const { crop, soil, season } = req.query
  const rec = getRecommendation({ crop, soil, season })
  res.json(rec)
})

// Dosage calculation
app.post('/api/dosage', (req, res) => {
  const { landSize, unit, fertilizerKgPerHa, tonicLPerHa } = req.body
  const result = calculateDosage({ landSize, unit, fertilizerKgPerHa, tonicLPerHa })
  res.json(result)
})

// Admin: list orders (only when DB connected)
app.get('/api/orders', async (req, res) => {
  if(!dbConnected) return res.status(400).json({ error: 'no db' })
  const list = await Order.find().sort({ createdAt: -1 }).lean()
  res.json(list)
})

app.get('/api/orders/:id', async (req, res) => {
  if(!dbConnected) return res.status(400).json({ error: 'no db' })
  const o = await Order.findById(req.params.id).lean()
  if(!o) return res.status(404).json({ error: 'not found' })
  res.json(o)
})

// Update order status (admin)
app.put('/api/orders/:id/status', async (req, res) => {
  if(!dbConnected) return res.status(400).json({ error: 'no db' })
  const { status } = req.body
  if(!status) return res.status(400).json({ error: 'status required' })
  try{
    const o = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean()
    if(!o) return res.status(404).json({ error: 'not found' })
    res.json(o)
  }catch(err){
    res.status(500).json({ error: err.message })
  }
})

// Checkout: generate WhatsApp order link (no external SMS required)
app.post('/api/checkout/whatsapp', async (req, res) => {
  try{
    const { customer = {}, items = [], total } = req.body
    if(!items || !items.length) return res.status(400).json({ error: 'no items' })
    const shopPhone = (process.env.SHOP_PHONE || '919000000000').replace(/[^0-9]/g,'')
    const lines = []
    lines.push(`Order from ${customer.name || 'Farmer'}`)
    if(customer.phone) lines.push(`Phone: ${customer.phone}`)
    if(customer.address) lines.push(`Address: ${customer.address}`)
    lines.push('Items:')
    for(const it of items) lines.push(`${it.name || it.id} x${it.qty || 1} @ ${it.price || ''}`)
    if(typeof total !== 'undefined') lines.push(`Total: ${total}`)
    lines.push('Payment: COD (cash on delivery)')
    const text = encodeURIComponent(lines.join('\n'))
    const wa = `https://wa.me/${shopPhone}?text=${text}`
    return res.json({ whatsapp: wa })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

// Send SMS summary to shop via Twilio (if configured)
app.post('/api/checkout/send-sms', async (req, res) => {
  try{
    const { customer = {}, items = [], total } = req.body
    if(!items || !items.length) return res.status(400).json({ error: 'no items' })
    const accountSid = process.env.TWILIO_SID
    const authToken = process.env.TWILIO_TOKEN
    const from = process.env.TWILIO_FROM
    const to = process.env.SHOP_PHONE
    if(!accountSid || !authToken || !from || !to) return res.status(400).json({ error: 'twilio not configured' })
    const twilio = require('twilio')(accountSid, authToken)
    const lines = []
    lines.push(`Order from ${customer.name || 'Farmer'}`)
    if(customer.phone) lines.push(`Phone: ${customer.phone}`)
    lines.push('Items:')
    for(const it of items) lines.push(`${it.name || it.id} x${it.qty || 1}`)
    if(typeof total !== 'undefined') lines.push(`Total: ${total}`)
    lines.push('Payment: COD')
    const body = lines.join('\n')
    const msg = await twilio.messages.create({ body, from, to })
    res.json({ sid: msg.sid })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

// S3 verification endpoint — uploads a small test object to configured bucket
app.get('/api/internal/s3-test', async (req, res) => {
  if(!s3Client) return res.status(400).json({ error: 's3 not configured' })
  try{
    const key = `test/test_${Date.now()}.txt`
    const body = Buffer.from('s3 test ' + new Date().toISOString())
    await s3Client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: 'text/plain' }))
    const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION||'us-east-1'}.amazonaws.com/${key}`
    res.json({ ok: true, url })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

// Internal smoke: trigger socket broadcast
app.get('/api/internal/smoke-socket', (req, res)=>{
  const test = { name: 'smoke', text: 'socket test from server', ts: new Date() }
  if(io) io.emit('message', test)
  return res.json({ ok: true, emitted: !!io })
})

// Internal smoke: run detect-disease logic on sample file (no multipart)
app.get('/api/internal/smoke-detect', async (req, res)=>{
  try{
    const samplePath = path.join(__dirname, '..', 'frontend', 'sample.jpg')
    if(!fs.existsSync(samplePath)) return res.status(404).json({ error: 'no sample file' })
    const buffer = fs.readFileSync(samplePath)

    // run HF inference if configured
    let disease='Unknown', confidence=0
    if(process.env.HF_API_KEY && process.env.HF_MODEL){
      try{
        const model = process.env.HF_MODEL
        const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.HF_API_KEY}`, 'Content-Type': 'application/octet-stream' }, body: buffer
        })
        const j = await r.json()
        if(Array.isArray(j) && j.length>0){ disease = j[0].label || 'Unknown'; confidence = j[0].score || 0 }
      }catch(e){ console.error('hf smoke failed', e) }
    }

    // if HF didn't produce result, fallback stub
    if(!disease || disease==='Unknown'){
      disease = 'Healthy'; confidence = 0.95
      const options = [['Leaf Blight',0.8], ['Powdery Mildew',0.76], ['Pest Attack',0.7], ['Nutrient Deficiency',0.65], ['Healthy',0.96]]
      const pick = options[Math.floor(Math.random()*options.length)]; disease = pick[0]; confidence = pick[1]
    }

    // optionally upload to S3
    let fileUrl = `/uploads/images/sample.jpg`
    if(s3Client){
      const key = `images/sample_${Date.now()}.jpg`
      try{ await s3Client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: buffer, ContentType: 'image/jpeg' })); fileUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}` }catch(e){ console.error('s3 smoke upload failed', e) }
    }

    const recommended = []
    if(disease.toLowerCase().includes('blight') || disease.toLowerCase().includes('pest')) recommended.push('p3')
    if(disease.toLowerCase().includes('deficien')) recommended.push('p1')
    if(disease.toLowerCase().includes('healthy')) recommended.push('p2')

    res.json({ file: fileUrl, disease, confidence, recommended })
  }catch(err){ res.status(500).json({ error: err.message }) }
})

const PORT = process.env.PORT || 5000;

// attach socket.io
io = new Server(server, { cors: { origin: '*' } })
io.on('connection', (socket)=>{
  console.log('socket connected', socket.id)
  // send history
  if(dbConnected){
    ChatMessage.find().sort({ ts: 1 }).limit(500).lean().then(msgs=> socket.emit('init_messages', msgs)).catch(()=> socket.emit('init_messages', []))
  } else {
    socket.emit('init_messages', chatMessages.slice(-200))
  }

  socket.on('send_message', async (data)=>{
    const m = { name: data.name || 'Farmer', text: data.text, ts: new Date() }
    if(dbConnected){
      const saved = await ChatMessage.create(m)
      io.emit('message', saved)
    } else {
      m.id = Date.now(); chatMessages.push(m)
      io.emit('message', m)
    }
  })
})

server.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
