import { useEffect, useState, useRef } from 'react'
import { socket } from './lib/socket'
import { useStore } from './store/useStore'
import { getSessions, getAllGroups, getJobs, createSession, connectQR, connectPairing, deleteSession, syncGroups, createJob, getJobLogs, deleteJob } from './lib/api'

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState<{id:number;msg:string;type:string}[]>([])
  const add = (msg:string, type='info') => {
    const id = Date.now()
    setToasts(t=>[...t,{id,msg,type}])
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),4000)
  }
  return { toasts, toast: add }
}

// ── STATUS ────────────────────────────────────────────────────────────────────
const ST: Record<string,{label:string;dot:string;text:string}> = {
  connected:       {label:'Bağlı',          dot:'bg-green-400',  text:'text-green-400'},
  disconnected:    {label:'Bağlı Değil',    dot:'bg-red-400',    text:'text-red-400'},
  connecting:      {label:'Bağlanıyor…',    dot:'bg-yellow-400 animate-pulse', text:'text-yellow-400'},
  qr_pending:      {label:'QR Bekleniyor',  dot:'bg-blue-400 animate-pulse',   text:'text-blue-400'},
  pairing_pending: {label:'Kod Bekleniyor', dot:'bg-purple-400 animate-pulse', text:'text-purple-400'},
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADD SESSION MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AddSessionModal({onClose,toast}:{onClose:()=>void;toast:(m:string,t?:string)=>void}) {
  const {setSessions,setGroups} = useStore()
  const [step,setStep]   = useState<'name'|'method'|'qr'|'pairing'>('name')
  const [name,setName]   = useState('')
  const [phone,setPhone] = useState('')
  const [sid,setSid]     = useState('')
  const [qr,setQr]       = useState('')
  const [code,setCode]   = useState('')
  const [loading,setLoading] = useState(false)

  async function doCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const s = await createSession(name.trim())
      setSid(s.id)
      const list = await getSessions()
      setSessions(list)
      setStep('method')
    } catch { toast('Hata oluştu','error') }
    setLoading(false)
  }

  async function doQR() {
    setStep('qr'); setLoading(true)
    await connectQR(sid)
    setLoading(false)
    socket.once('qr_code',({qr:q}:any) => setQr(q))
    socket.once('session_connected', async () => {
      const [s,g] = await Promise.all([getSessions(),getAllGroups()])
      setSessions(s); setGroups(g)
      toast('✅ WhatsApp bağlandı!','success')
      onClose()
    })
  }

  async function doPairing() {
    if (phone.replace(/\D/g,'').length < 10) { toast('Geçerli numara girin','error'); return }
    setLoading(true)
    try {
      await connectPairing(sid, phone)
      socket.once('pairing_code',({code:c}:any) => { setCode(c); setLoading(false) })
      socket.once('session_connected', async () => {
        const [s,g] = await Promise.all([getSessions(),getAllGroups()])
        setSessions(s); setGroups(g)
        toast('✅ WhatsApp bağlandı!','success')
        onClose()
      })
    } catch(e:any) { toast(e.message,'error'); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1c2128] border border-[#30363d] rounded-2xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">Yeni Hesap Ekle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {step==='name' && (
          <div className="space-y-4">
            <input className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#25D366] text-base" placeholder="Hesap adı (ör: Pazarlama)" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doCreate()} autoFocus />
            <button onClick={doCreate} disabled={loading||!name.trim()} className="w-full bg-[#25D366] text-black font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-[#22c45e] transition">
              {loading ? 'Oluşturuluyor…' : 'Devam Et →'}
            </button>
          </div>
        )}

        {step==='method' && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm mb-2">Bağlantı yöntemi seçin:</p>
            <button onClick={doQR} className="w-full border border-[#25D366]/50 hover:border-[#25D366] hover:bg-[#25D366]/10 rounded-xl p-4 flex items-center gap-4 transition text-left">
              <span className="text-3xl">📷</span>
              <div><div className="font-semibold">QR Kod</div><div className="text-sm text-gray-400">Telefondan QR okutarak bağlanın</div></div>
            </button>
            <button onClick={()=>setStep('pairing')} className="w-full border border-[#58a6ff]/50 hover:border-[#58a6ff] hover:bg-[#58a6ff]/10 rounded-xl p-4 flex items-center gap-4 transition text-left">
              <span className="text-3xl">🔢</span>
              <div><div className="font-semibold">Pairing Kodu</div><div className="text-sm text-gray-400">8 haneli kod ile QR okutmadan bağlanın</div></div>
            </button>
          </div>
        )}

        {step==='qr' && (
          <div className="text-center">
            {qr ? (
              <>
                <div className="bg-white p-3 rounded-xl inline-block mb-4"><img src={qr} alt="QR" className="w-56 h-56" /></div>
                <p className="text-sm text-gray-400">WhatsApp → ⋮ → Bağlı Cihazlar → Cihaz Bağla</p>
              </>
            ) : (
              <div className="py-10"><div className="text-4xl animate-spin mb-3">⏳</div><p className="text-gray-400">QR oluşturuluyor…</p></div>
            )}
          </div>
        )}

        {step==='pairing' && !code && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Telefon Numarası</label>
              <input className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl px-4 py-3 text-white text-lg tracking-widest focus:outline-none focus:border-[#58a6ff]" placeholder="905321234567" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,''))} />
              <p className="text-xs text-gray-500 mt-1">Ülke kodu dahil, + olmadan</p>
            </div>
            <button onClick={doPairing} disabled={loading||phone.length<10} className="w-full bg-[#58a6ff] text-black font-bold py-3 rounded-xl disabled:opacity-40 hover:bg-[#4d9ff0] transition">
              {loading ? '⏳ Kod isteniyor…' : 'Pairing Kodu Al →'}
            </button>
          </div>
        )}

        {step==='pairing' && code && (
          <div className="text-center space-y-4">
            <div className="bg-[#0d1117] border-2 border-[#25D366] rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-2">WhatsApp'a gireceğiniz kod:</p>
              <div className="text-5xl font-black tracking-[0.3em] text-[#25D366] font-mono">{code}</div>
            </div>
            <div className="text-sm text-gray-400 bg-[#0d1117] rounded-xl p-4 text-left space-y-1">
              <p className="text-white font-semibold mb-1">📱 Adımlar:</p>
              <p>1. WhatsApp'ı açın</p>
              <p>2. ⋮ → Bağlı Cihazlar → Cihaz Bağla</p>
              <p>3. "Telefon Numarasıyla Bağlan" seçin</p>
              <p>4. Yukarıdaki kodu girin</p>
            </div>
            <p className="text-xs text-gray-500 animate-pulse">Bağlantı bekleniyor…</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  SESSIONS PAGE
// ─────────────────────────────────────────────────────────────────────────────
function SessionsPage({toast}:{toast:(m:string,t?:string)=>void}) {
  const {sessions,setSessions,setGroups} = useStore()
  const [showAdd,setShowAdd] = useState(false)
  const [syncing,setSyncing] = useState('')

  async function handleDelete(id:string) {
    if (!confirm('Oturumu silmek istediğinizden emin misiniz?')) return
    await deleteSession(id)
    setSessions(await getSessions())
    toast('Oturum silindi','success')
  }

  async function handleSync(id:string) {
    setSyncing(id)
    await syncGroups(id)
    setGroups(await getAllGroups())
    setSyncing('')
    toast('Gruplar güncellendi','success')
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Hesapları</h1>
          <p className="text-gray-400 text-sm mt-0.5">{sessions.length} hesap · {sessions.filter(s=>s.status==='connected').length} bağlı</p>
        </div>
        <button onClick={()=>setShowAdd(true)} className="bg-[#25D366] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#22c45e] transition">+ Hesap Ekle</button>
      </div>

      {sessions.length===0 ? (
        <div className="text-center py-24 text-gray-500">
          <div className="text-7xl mb-4">📱</div>
          <p className="text-xl font-semibold">Henüz hesap yok</p>
          <p className="text-sm mt-2">Başlamak için "Hesap Ekle" butonuna tıklayın</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const st = ST[s.status]||ST.disconnected
            return (
              <div key={s.id} className="bg-[#1c2128] border border-[#30363d] rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 bg-[#25D366]/20 rounded-full flex items-center justify-center text-2xl flex-shrink-0">📱</div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate">{s.name}</div>
                    <div className="text-gray-400 text-sm">{s.phone ? `+${s.phone}` : 'Numara bekleniyor'}</div>
                    <div className={`flex items-center gap-1.5 text-sm mt-1 ${st.text}`}>
                      <span className={`w-2 h-2 rounded-full ${st.dot}`}/>
                      {st.label}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {s.status==='connected' && (
                    <button onClick={()=>handleSync(s.id)} disabled={syncing===s.id} className="text-sm px-3 py-1.5 border border-[#30363d] rounded-lg text-gray-300 hover:bg-[#30363d] transition disabled:opacity-40">
                      {syncing===s.id?'⏳':'🔄'} Grupları Yenile
                    </button>
                  )}
                  <button onClick={()=>handleDelete(s.id)} className="text-sm px-3 py-1.5 border border-red-900/50 text-red-400 rounded-lg hover:bg-red-900/20 transition">🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showAdd && <AddSessionModal onClose={()=>setShowAdd(false)} toast={toast}/>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPOSE PAGE
// ─────────────────────────────────────────────────────────────────────────────
function ComposePage({toast}:{toast:(m:string,t?:string)=>void}) {
  const {groups,selectedGroups,toggleGroup,selectAll,clearSelection,addJob} = useStore()
  const [msg,setMsg]         = useState('')
  const [search,setSearch]   = useState('')
  const [media,setMedia]     = useState<File|null>(null)
  const [sched,setSched]     = useState(false)
  const [schedTime,setSchedTime] = useState('')
  const [jobName,setJobName] = useState('')
  const [sending,setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = groups.filter(g=>g.group_name.toLowerCase().includes(search.toLowerCase()))
  const EMOJIS = ['👋','🎉','⚡','📢','✅','🔥','💡','📅','🕐','📍','💬','🌟','🙏','👍','📌','🎯','💼','🏆']

  function ins(txt:string) {
    const el = document.getElementById('msginput') as HTMLTextAreaElement
    if (!el) return
    const s=el.selectionStart,e=el.selectionEnd
    const v=msg.slice(0,s)+txt+msg.slice(e)
    setMsg(v)
    setTimeout(()=>{el.selectionStart=el.selectionEnd=s+txt.length;el.focus()},0)
  }

  async function send() {
    if (!selectedGroups.size) { toast('En az bir grup seçin!','error'); return }
    if (!msg.trim()&&!media) { toast('Mesaj veya medya ekleyin!','error'); return }
    setSending(true)
    try {
      const r = await createJob({name:jobName||undefined,groupJids:[...selectedGroups],message:msg,scheduledAt:sched&&schedTime?schedTime:undefined,media:media||undefined})
      addJob({...r,sent_count:0,failed_count:0})
      toast(sched?'📅 Görev zamanlandı!':'🚀 Gönderim başlatıldı!','success')
      setMsg(''); setMedia(null); clearSelection(); setJobName('')
    } catch(e:any) { toast('Hata: '+(e.response?.data?.error||e.message),'error') }
    setSending(false)
  }

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* Sol: Grup listesi */}
      <div className="w-72 flex-shrink-0 border-r border-[#30363d] flex flex-col bg-[#161b22]">
        <div className="p-4 border-b border-[#30363d]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold">
              Gruplar <span className="text-[#25D366]">({selectedGroups.size})</span>
            </span>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-[#25D366] hover:underline">Tümü</button>
              <span className="text-gray-600">|</span>
              <button onClick={clearSelection} className="text-gray-400 hover:underline">Temizle</button>
            </div>
          </div>
          <input className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[#25D366]" placeholder="🔍 Grup ara…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {groups.length===0 ? (
            <div className="text-center py-10 text-gray-500 text-sm px-4">
              <p>📱 Bağlı hesap yok</p>
              <p className="text-xs mt-1">Hesaplar sayfasından hesap ekleyin</p>
            </div>
          ) : filtered.map(g=>(
            <label key={g.group_jid} className={`flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition ${selectedGroups.has(g.group_jid)?'bg-[#25D366]/15 border border-[#25D366]/30':'hover:bg-[#1c2128] border border-transparent'}`}>
              <input type="checkbox" checked={selectedGroups.has(g.group_jid)} onChange={()=>toggleGroup(g.group_jid)} className="accent-[#25D366] w-4 h-4 flex-shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{g.group_name}</div>
                <div className="text-xs text-gray-500 truncate">{g.participant_count} üye · {g.session_name}</div>
                {!g.is_admin && <div className="text-xs text-orange-400">⚠ Admin değil</div>}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Sağ: Editör */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <label className="text-sm text-gray-400 block mb-1.5">Görev Adı <span className="text-gray-600">(opsiyonel)</span></label>
          <input className="w-full bg-[#1c2128] border border-[#30363d] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#25D366]" placeholder="ör. Nisan Kampanyası" value={jobName} onChange={e=>setJobName(e.target.value)}/>
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1.5">Mesaj</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            <button onClick={()=>ins(`*bold*`)} className="px-2.5 py-1 bg-[#1c2128] border border-[#30363d] rounded-lg text-xs font-bold hover:border-[#25D366] transition">B</button>
            <button onClick={()=>ins(`_italic_`)} className="px-2.5 py-1 bg-[#1c2128] border border-[#30363d] rounded-lg text-xs italic hover:border-[#25D366] transition">I</button>
            {EMOJIS.map(e=><button key={e} onClick={()=>ins(e)} className="px-1.5 py-1 bg-[#1c2128] border border-[#30363d] rounded-lg text-sm hover:border-[#25D366] transition">{e}</button>)}
          </div>
          <textarea id="msginput" className="w-full bg-[#1c2128] border border-[#30363d] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#25D366] resize-none leading-relaxed" rows={7} placeholder="Mesajınızı yazın…&#10;&#10;*kalın* _italik_ WhatsApp formatlaması desteklenir." value={msg} onChange={e=>setMsg(e.target.value)}/>
          <div className="text-right text-xs text-gray-500 mt-1">{msg.length}/4096</div>
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1.5">Medya <span className="text-gray-600">(opsiyonel · max 64MB)</span></label>
          <div onClick={()=>fileRef.current?.click()} className="border-2 border-dashed border-[#30363d] rounded-xl p-5 text-center cursor-pointer hover:border-[#25D366] transition">
            {media ? (
              <div className="flex items-center justify-between">
                <span className="text-white text-sm">📎 {media.name} ({(media.size/1024/1024).toFixed(1)}MB)</span>
                <button onClick={e=>{e.stopPropagation();setMedia(null)}} className="text-red-400 text-xs ml-2 hover:underline">Kaldır</button>
              </div>
            ) : <div className="text-gray-500 text-sm"><div className="text-2xl mb-1">🖼️</div>Resim, Video veya PDF seçin</div>}
          </div>
          <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx" onChange={e=>setMedia(e.target.files?.[0]||null)}/>
        </div>

        <div className="bg-[#1c2128] border border-[#30363d] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">📅 Zamanlanmış Gönderim</span>
            <button onClick={()=>setSched(!sched)} className={`relative w-11 h-6 rounded-full transition-colors ${sched?'bg-[#25D366]':'bg-[#30363d]'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${sched?'translate-x-6':'translate-x-1'}`}/>
            </button>
          </div>
          {sched && <input type="datetime-local" className="w-full mt-3 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#25D366]" value={schedTime} onChange={e=>setSchedTime(e.target.value)} min={new Date().toISOString().slice(0,16)}/>}
        </div>

        <button onClick={send} disabled={sending||!selectedGroups.size||(!msg.trim()&&!media)} className="w-full bg-[#25D366] text-black font-bold py-4 rounded-2xl text-lg hover:bg-[#22c45e] disabled:opacity-40 transition flex items-center justify-center gap-2">
          {sending ? <><span className="animate-spin">⏳</span> Gönderiliyor…</> : <><span>📤</span>{selectedGroups.size>0?`${selectedGroups.size} Gruba Gönder`:'Grupları Seçin'}</>}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  JOBS PAGE
// ─────────────────────────────────────────────────────────────────────────────
const JOB_ST: Record<string,string> = {
  pending:'bg-yellow-900/40 text-yellow-300 border-yellow-800',
  running:'bg-blue-900/40 text-blue-300 border-blue-800',
  completed:'bg-green-900/40 text-green-300 border-green-800',
  failed:'bg-red-900/40 text-red-300 border-red-800',
}
const LOG_ST: Record<string,{label:string;cls:string}> = {
  sent:         {label:'✅ Gönderildi',   cls:'text-green-400'},
  failed_admin: {label:'⚠️ Admin Değil', cls:'text-orange-400'},
  failed_limit: {label:'🚫 Limit Aşıldı',cls:'text-red-400'},
  failed_error: {label:'❌ Hata',         cls:'text-red-400'},
  pending:      {label:'⏳ Beklemede',    cls:'text-gray-400'},
}

function JobsPage({toast}:{toast:(m:string,t?:string)=>void}) {
  const {jobs,setJobs,updateJob} = useStore()
  const [logs,setLogs]   = useState<any[]>([])
  const [selJob,setSelJob] = useState('')
  const [loadLogs,setLoadLogs] = useState(false)

  async function openLogs(id:string) {
    setSelJob(id); setLoadLogs(true)
    setLogs(await getJobLogs(id))
    setLoadLogs(false)
  }

  async function handleDelete(id:string) {
    if (!confirm('Görevi silmek istediğinizden emin misiniz?')) return
    await deleteJob(id)
    setJobs(await getJobs())
    toast('Görev silindi')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Görev Geçmişi</h1>
          <p className="text-gray-400 text-sm mt-0.5">{jobs.length} görev</p>
        </div>
      </div>

      {jobs.length===0 ? (
        <div className="text-center py-24 text-gray-500">
          <div className="text-7xl mb-4">📋</div>
          <p className="text-xl font-semibold">Henüz görev yok</p>
          <p className="text-sm mt-2">Mesaj Oluştur sayfasından ilk gönderimi başlatın</p>
        </div>
      ) : jobs.map(job=>{
        const pct = job.total_groups>0 ? Math.round(((job.sent_count+job.failed_count)/job.total_groups)*100) : 0
        return (
          <div key={job.id} className="bg-[#1c2128] border border-[#30363d] rounded-2xl p-5 mb-3">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="font-semibold text-white">{job.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{new Date(job.created_at).toLocaleString('tr-TR')}</div>
              </div>
              <span className={`text-xs px-3 py-1 rounded-full border ${JOB_ST[job.status]||JOB_ST.pending}`}>
                {job.status==='running'?'⚡ Çalışıyor':job.status==='completed'?'✅ Tamamlandı':job.status==='failed'?'❌ Başarısız':'⏳ Bekliyor'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#0d1117] rounded-xl p-3 text-center">
                <div className="text-xl font-bold">{job.total_groups}</div><div className="text-xs text-gray-500">Toplam</div>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-green-400">{job.sent_count}</div><div className="text-xs text-gray-500">Gönderildi</div>
              </div>
              <div className="bg-[#0d1117] rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-red-400">{job.failed_count}</div><div className="text-xs text-gray-500">Başarısız</div>
              </div>
            </div>

            {job.status==='running' && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1"><span>İlerleme</span><span>{pct}%</span></div>
                <div className="h-1.5 bg-[#30363d] rounded-full overflow-hidden">
                  <div className="h-full bg-[#25D366] rounded-full transition-all duration-500" style={{width:`${pct}%`}}/>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={()=>openLogs(job.id)} className="text-sm px-3 py-1.5 border border-[#30363d] text-gray-300 rounded-lg hover:bg-[#30363d] transition">📋 Loglar</button>
              <button onClick={()=>handleDelete(job.id)} className="text-sm px-3 py-1.5 border border-red-900/50 text-red-400 rounded-lg hover:bg-red-900/20 transition">🗑 Sil</button>
            </div>
          </div>
        )
      })}

      {selJob && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c2128] border border-[#30363d] rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-[#30363d]">
              <h3 className="font-bold text-lg">Gönderim Logları</h3>
              <button onClick={()=>setSelJob('')} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadLogs ? (
                <div className="text-center py-8 text-gray-400 animate-pulse">Yükleniyor…</div>
              ) : logs.length===0 ? (
                <div className="text-center py-8 text-gray-500">Log bulunamadı</div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-gray-500 border-b border-[#30363d] text-left"><th className="pb-2">Grup</th><th className="pb-2">Durum</th><th className="pb-2">Zaman</th></tr></thead>
                  <tbody>
                    {logs.map((l:any)=>{
                      const s=LOG_ST[l.status]||LOG_ST.pending
                      return (
                        <tr key={l.id} className="border-b border-[#30363d]/50">
                          <td className="py-2.5 text-white">{l.group_name}</td>
                          <td className={`py-2.5 ${s.cls}`}>{s.label}{l.error_msg&&<div className="text-xs text-gray-500">{l.error_msg}</div>}</td>
                          <td className="py-2.5 text-gray-500 text-xs">{new Date(l.sent_at).toLocaleString('tr-TR')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const {sessions,groups,jobs,page,setSessions,setGroups,setJobs,updateSession,updateJob,addJob,setPage} = useStore()
  const {toasts,toast} = useToast()

  // Socket events
  useEffect(()=>{
    socket.on('session_status',({sessionId,status})=>updateSession(sessionId,{status}))
    socket.on('session_connected',async({sessionId,phone,name})=>{
      updateSession(sessionId,{status:'connected',phone,name})
      const [s,g]=await Promise.all([getSessions(),getAllGroups()])
      setSessions(s); setGroups(g)
    })
    socket.on('session_disconnected',({sessionId})=>updateSession(sessionId,{status:'disconnected'}))
    socket.on('groups_synced',async()=>{ setGroups(await getAllGroups()) })
    socket.on('job_progress',d=>updateJob(d.jobId,{sent_count:d.sent,failed_count:d.failed,status:'running'}))
    socket.on('job_completed',d=>{
      updateJob(d.jobId,{status:'completed',sent_count:d.sent,failed_count:d.failed})
      toast(`🎉 Tamamlandı: ${d.sent}/${d.total} gönderildi`,'success')
    })
    return ()=>{ socket.off('session_status'); socket.off('session_connected'); socket.off('session_disconnected'); socket.off('groups_synced'); socket.off('job_progress'); socket.off('job_completed') }
  },[])

  // Initial load
  useEffect(()=>{
    Promise.all([getSessions(),getAllGroups(),getJobs()])
      .then(([s,g,j])=>{ setSessions(s); setGroups(g); setJobs(j) })
      .catch(console.error)
  },[])

  const connected = sessions.filter(s=>s.status==='connected').length
  const running   = jobs.filter(j=>j.status==='running').length

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">
      {/* Topbar */}
      <header className="bg-[#161b22] border-b border-[#30363d] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#25D366] rounded-xl flex items-center justify-center text-black font-black text-lg">W</div>
          <div>
            <div className="font-bold leading-tight">WA Toplu Mesaj</div>
            <div className={`text-xs ${connected>0?'text-green-400':'text-gray-500'}`}>
              {connected>0?`${connected} hesap bağlı`:'Hesap bağlı değil'}
            </div>
          </div>
        </div>
        <nav className="flex gap-1">
          {([['sessions','📱 Hesaplar',sessions.length>0?`${sessions.length}`:null],['compose','✉️ Gönder',groups.length>0?`${groups.length} grup`:null],['jobs','📋 Görevler',running>0?`${running} aktif`:null]] as const).map(([p,label,badge])=>(
            <button key={p} onClick={()=>setPage(p)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${page===p?'bg-[#25D366] text-black':'text-gray-300 hover:bg-[#21262d]'}`}>
              {label}
              {badge && <span className={`text-xs px-1.5 py-0.5 rounded-full ${page===p?'bg-black/20':'bg-[#30363d]'}`}>{badge}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-hidden">
        {page==='sessions' && <SessionsPage toast={toast}/>}
        {page==='compose'  && <ComposePage  toast={toast}/>}
        {page==='jobs'     && <JobsPage     toast={toast}/>}
      </main>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t=>(
          <div key={t.id} className={`px-4 py-3 rounded-xl text-sm font-medium shadow-xl border ${t.type==='success'?'bg-green-900/80 border-green-700 text-green-200':t.type==='error'?'bg-red-900/80 border-red-700 text-red-200':'bg-[#1c2128] border-[#30363d] text-gray-200'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
