const puppeteer = require('puppeteer')
const path = require('path')

async function run(){
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(20000)

  // Chat page
  console.log('Opening chat page...')
  await page.goto('http://localhost:5173/#chat', { waitUntil: 'networkidle2' })
  await page.waitForSelector('.h-64')
  const before = await page.$$eval('.h-64 .mb-2', nodes => nodes.length)
  console.log('Messages before:', before)

  // fill name and message
  await page.evaluate(() => {
    const inputs = document.querySelectorAll('main input')
    if(inputs && inputs.length>=2){
      inputs[0].value = 'E2ETester'
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
      inputs[1].value = 'Hello from E2E'
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  // trigger server-side test emission (internal smoke) to simulate a new message
  await page.evaluate(async () => {
    await fetch('http://localhost:5000/api/internal/smoke-socket')
  })
  // wait for new message emitted by server
  await page.waitForFunction((n)=> document.querySelectorAll('.h-64 .mb-2').length > n, {}, before)
  const after = await page.$$eval('.h-64 .mb-2', nodes => nodes.length)
  console.log('Messages after send:', after)

  // Plant disease page
  console.log('Opening plant disease page...')
  const page2 = await browser.newPage()
  await page2.goto('http://127.0.0.1:5173/#plant', { waitUntil: 'networkidle2' })
  // dump main HTML for debugging if input isn't present
  const mainHtml = await page2.evaluate(() => document.querySelector('main')?.innerHTML || '')
  console.log('Plant page main HTML snippet length:', mainHtml.length)
  console.log('Plant page main HTML snippet:', mainHtml.slice(0,800))
  // then wait for the file input
  await page2.waitForSelector('input[type=file]')
  const fileInput = await page2.$('input[type=file]')
  const sample = path.resolve(__dirname, '..', 'frontend', 'sample.jpg')
  console.log('Uploading sample image:', sample)
  await fileInput.uploadFile(sample)
  // click detect button adjacent to input
  await page2.click('input[type=file] + div button')
  // wait for result card
  await page2.waitForSelector('.mt-4.bg-white')
  const result = await page2.$eval('.mt-4.bg-white', el => el.innerText)
  console.log('Detection result snippet:\n', result.slice(0, 400))

  await browser.close()
  console.log('E2E smoke test completed successfully')
}

run().catch(err=>{ console.error('E2E test failed', err); process.exit(1) })
