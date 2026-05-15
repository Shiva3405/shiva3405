const mongoose = require('mongoose')
require('dotenv').config()
const { Product, initSampleProducts } = require('./models')

async function run(){
  const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI
  if(!MONGO) return console.error('MONGO_URI not set in env')
  try{
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
    console.log('connected to mongo — seeding...')
    await initSampleProducts()
    console.log('seed complete')
    process.exit(0)
  }catch(e){ console.error('seed failed', e); process.exit(1) }
}

run()
