import React, {useEffect, useState, useRef} from 'react'
import { io } from 'socket.io-client'

export default function Chat(){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [name, setName] = useState('Farmer')
  const domRef = useRef()
  const socketRef = useRef()

  const fetch = async ()=>{
    // kept for compatibility; usually socket will initialize messages
    return
  }
  useEffect(()=>{
    const socket = io('http://localhost:5000')
    socket.on('init_messages', (msgs)=>{ setMessages(msgs); setTimeout(()=>{ if(domRef.current) domRef.current.scrollTop = domRef.current.scrollHeight }, 50) })
    socket.on('message', (m)=>{ setMessages(prev=> [...prev, m]); setTimeout(()=>{ if(domRef.current) domRef.current.scrollTop = domRef.current.scrollHeight }, 50) })
    // save socket on ref to reuse for sending
    socketRef.current = socket
    return ()=>{ socket.disconnect() }
  }, [])

  const send = async ()=>{
    if(!text) return
    const socket = socketRef.current
    if(socket){
      socket.emit('send_message', { name, text })
      setText('')
    }
  }

  return (
    <div>
      <header className="bg-white shadow sticky top-0 z-20">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="font-bold text-green-800">Farmer Chat</div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white p-4 rounded shadow mb-4">
          <div ref={domRef} className="h-64 overflow-y-auto border p-2">
            {messages.map(m=> (
              <div key={m._id || m.id || m.ts} className="mb-2">
                <div className="text-sm font-semibold">{m.name} <span className="text-xs text-gray-500">{new Date(m.ts).toLocaleTimeString()}</span></div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            <input className="border p-2 rounded col-span-1 md:col-span-1" value={name} onChange={e=>setName(e.target.value)} />
            <input className="border p-2 rounded col-span-1 md:col-span-2" value={text} onChange={e=>setText(e.target.value)} />
            <button onClick={send} className="bg-green-600 text-white px-3 py-1 rounded">Send</button>
          </div>
        </div>
      </main>
    </div>
  )
}
