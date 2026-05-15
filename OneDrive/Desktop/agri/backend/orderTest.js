const axios = require('axios')

async function run(){
  try{
    // fetch products first
    const p = await axios.get('http://localhost:5000/api/products')
    const products = p.data || []
    if(!products.length) return console.error('no products to order')

    const first = products[0]
    const order = { items: [{ id: first.id || first._id || first.productId || 'p1', qty: 1 }] }
    const r = await axios.post('http://localhost:5000/api/orders', order)
    console.log('create order response:', r.data)

    // list orders
    const list = await axios.get('http://localhost:5000/api/orders')
    console.log('orders list length:', (list.data||[]).length)
  }catch(e){
    console.error('order test failed', e.response?.data || e.message)
    process.exit(1)
  }
}

run()
