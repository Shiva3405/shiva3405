import React, {useState} from 'react'
import axios from 'axios'

export default function WhatsAppCheckout(){
  const [loading, setLoading] = useState(false)
  const [wa, setWa] = useState(null)
  const [smsResult, setSmsResult] = useState(null)

  const getCart = ()=>{
    try{ return JSON.parse(localStorage.getItem('cart')||'[]') }catch(e){return[]}
  }

  const handleWA = async ()=>{
    setLoading(true)
    const items = getCart()
    const total = items.reduce((s,i)=> s + (i.price||0)*(i.qty||1), 0)
    try{
      const r = await axios.post('/api/checkout/whatsapp', { customer: {}, items, total })
      setWa(r.data.whatsapp)
    }catch(e){ console.error(e); alert('failed to create whatsapp link') }
    setLoading(false)
  }

  const handleSMS = async ()=>{
    setLoading(true)
    const items = getCart()
    const total = items.reduce((s,i)=> s + (i.price||0)*(i.qty||1), 0)
    try{
      const r = await axios.post('/api/checkout/send-sms', { customer: {}, items, total })
      setSmsResult(r.data)
    }catch(e){ console.error(e); alert('failed to send sms') }
    setLoading(false)
  }

  const items = getCart()
  if(items.length===0) return <div className="p-4 bg-white rounded">Cart is empty — add products to cart to checkout.</div>

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="font-medium mb-2">Checkout</div>
      <div className="text-sm text-gray-600 mb-2">Items: {items.length} — Total ₹{items.reduce((s,i)=> s + (i.price||0)*(i.qty||1), 0)}</div>
      <div className="space-x-2">
        <button onClick={handleWA} className="px-3 py-1 bg-green-600 text-white rounded" disabled={loading}>Generate WhatsApp Link</button>
        <button onClick={handleSMS} className="px-3 py-1 bg-blue-600 text-white rounded" disabled={loading}>Send SMS to Shop</button>
      </div>
      {wa && <div className="mt-2"><a href={wa} target="_blank" rel="noreferrer" className="text-green-700 underline">Open WhatsApp link</a></div>}
      {smsResult && <div className="mt-2 text-sm text-gray-700">SMS sent: {smsResult.sid}</div>}
    </div>
  )
}
