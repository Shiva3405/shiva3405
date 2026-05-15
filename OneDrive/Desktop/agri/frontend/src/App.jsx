import React, {useState, useMemo} from 'react'
import Home from './pages/Home'
import Products from './pages/Products'
import Cart from './components/Cart'

export default function App(){
  const [cartItems, setCartItems] = useState(() => {
    try{ return JSON.parse(localStorage.getItem('cart')||'[]') }catch(e){return[]}
  })

  const addToCart = (product, qty=1) => {
    setCartItems(prev=>{
      const idx = prev.findIndex(p=>p.id===product.id)
      let next = [...prev]
      if(idx===-1) next.push({...product, qty})
      else next[idx].qty = Math.min((next[idx].qty||0)+qty, product.stock)
      localStorage.setItem('cart', JSON.stringify(next))
      return next
    })
  }

  const removeFromCart = (id) => {
    setCartItems(prev=>{ const next = prev.filter(p=>p.id!==id); localStorage.setItem('cart', JSON.stringify(next)); return next })
  }

  const currentHash = typeof window !== 'undefined' ? (window.location.hash || '#home') : '#home'

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {currentHash === '#products' && <Products addToCart={addToCart} />}
      {currentHash === '#cart' && <div className="max-w-4xl mx-auto p-6"><Cart items={cartItems} remove={removeFromCart} /></div>}
      {currentHash === '#home' && <Home addToCart={addToCart} />}
      {currentHash === '#checkout' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading checkout…</div>}><CheckoutPage /></React.Suspense></div>}
      {currentHash === '#admin' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading admin…</div>}><AdminPage /></React.Suspense></div>}
      {currentHash === '#cropguide' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading crop guide…</div>}><CropGuidePage /></React.Suspense></div>}
      {currentHash === '#plant' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading…</div>}><PlantPage /></React.Suspense></div>}
      {currentHash === '#videos' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading videos…</div>}><VideosPage /></React.Suspense></div>}
      {currentHash === '#chat' && <div className="max-w-6xl mx-auto p-6"><React.Suspense fallback={<div>Loading chat…</div>}><ChatPage /></React.Suspense></div>}
      <div className="fixed bottom-4 right-4">
        <a href="#cart" className="bg-green-600 text-white px-4 py-2 rounded shadow">Cart ({cartItems.length})</a>
      </div>
    </div>
  )
}

// Lazy load Admin to keep initial bundle small
const AdminPage = React.lazy(()=> import('./pages/Admin'))
const CropGuidePage = React.lazy(()=> import('./pages/CropGuide'))
const PlantPage = React.lazy(()=> import('./pages/PlantDisease'))
const VideosPage = React.lazy(()=> import('./pages/Videos'))
const ChatPage = React.lazy(()=> import('./pages/Chat'))
const CheckoutPage = React.lazy(()=> import('./pages/Checkout'))
