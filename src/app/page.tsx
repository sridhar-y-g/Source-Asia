'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface AuthState  { token:string; username:string; expiresAt:number }
interface ToastItem  { id:string; type:'success'|'error'|'warning'|'info'; title:string; message:string }
interface ResponseData { status:number; body:string; bodyFmt:string; headers:[string,string][]; timeMs:number }
interface UserStat   { userId:string; totalRequests:number; successfulRequests:number; rateLimitedRequests:number; lastRequestAt:string|null }

type Tid = 'tester'|'stats'|'docs'
type ReqTab = 'body'|'auth'|'headers'
type ResTab = 'body'|'headers'
type EpId  = 'login'|'request'|'stats'|'stats-user'

interface Endpoint { id:EpId; name:string; method:'POST'|'GET'; path:string; defaultBody?:string; requiresAuth:boolean; desc:string }

// ── Endpoints Config ───────────────────────────────────────────────────────────
const ENDPOINTS: Endpoint[] = [
  { id:'login',      name:'Login',           method:'POST', path:'/api/auth/login',          defaultBody:JSON.stringify({username:'admin',password:'admin123'},null,2),                                         requiresAuth:false, desc:'Get JWT access token' },
  { id:'request',    name:'Send Request',    method:'POST', path:'/api/request',             defaultBody:JSON.stringify({user_id:'user_001',payload:{action:'fetch_data',query:'products'}},null,2),            requiresAuth:true,  desc:'Rate-limited user request' },
  { id:'stats',      name:'All User Stats',  method:'GET',  path:'/api/stats',               defaultBody:undefined,                                                                                             requiresAuth:true,  desc:'Aggregate statistics' },
  { id:'stats-user', name:'Single User Stat',method:'GET',  path:'/api/stats?user_id=user_001',defaultBody:undefined,                                                                                          requiresAuth:true,  desc:'Stats for one user' },
]

// ── Utilities ──────────────────────────────────────────────────────────────────
function syntaxHighlight(json: string): string {
  const escaped = json.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  return escaped.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    m => {
      if (/^"/.test(m)) return /:$/.test(m) ? `<span class="jk">${m}</span>` : `<span class="js">${m}</span>`
      if (/true|false/.test(m)) return `<span class="jb">${m}</span>`
      if (/null/.test(m)) return `<span class="jl">${m}</span>`
      return `<span class="jn">${m}</span>`
    }
  )
}

function decodeJwt(token: string): { header: Record<string,unknown>; payload: Record<string,unknown> } | null {
  try {
    const [h, p] = token.split('.')
    const decode = (b64: string) => JSON.parse(atob(b64.replace(/-/g,'+').replace(/_/g,'/')))
    return { header: decode(h), payload: decode(p) }
  } catch { return null }
}

function statusClass(s: number) { if (s===429) return 's-429'; if (s>=200&&s<300) return 's-2xx'; if (s>=400) return 's-4xx'; return 's-err' }
function statusLabel(s: number) { const m:Record<number,string>={200:'OK',201:'Created',400:'Bad Request',401:'Unauthorized',404:'Not Found',429:'Rate Limited',500:'Server Error'}; return m[s]??'' }
function fmtBytes(b: number) { if(b<1024) return b+'B'; return (b/1024).toFixed(1)+'KB' }

// ── Icons ──────────────────────────────────────────────────────────────────────
const I = {
  Lightning: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#a78bfa"/><stop offset="100%" stopColor="#38bdf8"/></linearGradient></defs><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#lg)"/></svg>,
  Shield: () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#6366f1"/></linearGradient></defs><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="url(#sg)"/><circle cx="12" cy="11" r="2.4" fill="white" opacity="0.9"/><rect x="11.2" y="13.2" width="1.6" height="3.2" rx="0.8" fill="white" opacity="0.9"/></svg>,
  Send: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Copy: ({s=14}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Check: ({s=16}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" className="ck"/></svg>,
  X: ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Alert: ({s=16}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Info: ({s=16}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  User: ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Lock: ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Eye:  ({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeO:({s=15}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Key:  ({s=14}:{s?:number}) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>,
  Logout: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Refresh: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
  Chart: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  Book: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  ChevD: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
}

// ── Toast System ───────────────────────────────────────────────────────────────
function Toasts({ items, remove }: { items:ToastItem[]; remove:(id:string)=>void }) {
  const cfg = {
    success: { ico:<I.Check />, c:'#22c55e', bg:'rgba(34,197,94,0.1)',   br:'rgba(34,197,94,0.25)'   },
    error:   { ico:<I.Alert />, c:'#ef4444', bg:'rgba(239,68,68,0.1)',   br:'rgba(239,68,68,0.25)'   },
    warning: { ico:<I.Alert />, c:'#f97316', bg:'rgba(249,115,22,0.1)', br:'rgba(249,115,22,0.25)'  },
    info:    { ico:<I.Info />,  c:'#6366f1', bg:'rgba(99,102,241,0.1)', br:'rgba(99,102,241,0.25)'  },
  }
  return (
    <div style={{position:'fixed',top:20,right:20,zIndex:9999,display:'flex',flexDirection:'column',gap:10,pointerEvents:'none'}}>
      {items.map(t => { const c=cfg[t.type]; return (
        <div key={t.id} className="a-toast" style={{pointerEvents:'all',position:'relative',overflow:'hidden',display:'flex',gap:12,alignItems:'flex-start',padding:'13px 15px',background:c.bg,border:`1px solid ${c.br}`,borderRadius:12,minWidth:300,maxWidth:360,backdropFilter:'blur(20px)'}}>
          <span style={{color:c.c,marginTop:1,flexShrink:0}}>{c.ico}</span>
          <div style={{flex:1}}>
            <p style={{fontWeight:600,fontSize:13,color:'var(--text)',marginBottom:1}}>{t.title}</p>
            <p style={{fontSize:12,color:'var(--text-sub)'}}>{t.message}</p>
          </div>
          <button onClick={()=>remove(t.id)} style={{background:'none',border:'none',color:'var(--text-sub)',cursor:'pointer',padding:2,flexShrink:0}}><I.X /></button>
          <div className="tbar" style={{background:c.c}} />
        </div>
      )})}
    </div>
  )
}

// ── Login Modal ────────────────────────────────────────────────────────────────
function LoginModal({ onLogin }: { onLogin:(a:AuthState)=>void }) {
  const [mode,    setMode]    = useState<'login'|'register'>('login')
  const [user,    setUser]    = useState('admin')
  const [pass,    setPass]    = useState('admin123')
  const [confirm, setConfirm] = useState('')
  const [showP,   setShowP]   = useState(false)
  const [showC,   setShowC]   = useState(false)
  const [load,    setLoad]    = useState(false)
  const [err,    setErr]    = useState('')
  const [shake,  setShake]  = useState(false)

  const switchMode = (m: 'login'|'register') => {
    setMode(m); setErr(''); setUser(''); setPass(''); setConfirm(''); setShowP(false); setShowC(false)
    if (m === 'login') { setUser('admin'); setPass('admin123') }
  }

  const strengthLevel = (p: string) => {
    if (!p) return 0
    let s = 0
    if (p.length >= 6) s++
    if (p.length >= 10) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^a-zA-Z0-9]/.test(p)) s++
    return s
  }
  const strength = strengthLevel(pass)
  const strengthLabel = ['','Weak','Fair','Good','Strong','Very Strong'][strength]
  const strengthColor = ['','#ef4444','#f97316','#eab308','#22c55e','#06b6d4'][strength]

  const doShake = () => { setShake(true); setTimeout(() => setShake(false), 500) }

  const login = async () => {
    if (!user || !pass) { setErr('Both fields are required'); doShake(); return }
    setLoad(true); setErr('')
    try {
      const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user.trim(),password:pass})})
      const d = await r.json()
      if (!r.ok) { setErr(d.error||'Invalid credentials'); doShake(); return }
      onLogin({token:d.token,username:d.user.username,expiresAt:d.expiresAt})
    } catch { setErr('Network error — is the server running?') }
    finally   { setLoad(false) }
  }

  const register = async () => {
    if (!user || !pass) { setErr('All fields are required'); doShake(); return }
    if (user.trim().length < 3) { setErr('Username must be at least 3 characters'); doShake(); return }
    if (!/^[a-zA-Z0-9_]+$/.test(user.trim())) { setErr('Username: letters, numbers, underscores only'); doShake(); return }
    if (pass.length < 6) { setErr('Password must be at least 6 characters'); doShake(); return }
    if (confirm && confirm !== pass) { setErr('Passwords do not match'); doShake(); return }
    setLoad(true); setErr('')
    try {
      const r = await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:user.trim(),password:pass,confirmPassword:confirm||pass})})
      const d = await r.json()
      if (!r.ok) { setErr(d.error||'Registration failed'); doShake(); return }
      onLogin({token:d.token,username:d.user.username,expiresAt:d.expiresAt})
    } catch { setErr('Network error — is the server running?') }
    finally   { setLoad(false) }
  }

  const isLogin = mode === 'login'

  return (
    <div className="a-back" style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(7,7,20,0.92)',backdropFilter:'blur(14px)'}}>
      <div style={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0}}>
        <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/><div className="grid-bg"/>
      </div>
      <div className={`a-modal ${shake?'a-shake':''}`} style={{position:'relative',zIndex:1,width:440,background:'rgba(16,16,30,0.95)',border:'1px solid rgba(124,58,237,0.3)',borderRadius:20,padding:'32px 36px',display:'flex',flexDirection:'column',gap:18,boxShadow:'0 24px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)'}}>
        {/* Top glow */}
        <div style={{position:'absolute',top:0,left:'20%',right:'20%',height:1,background:'linear-gradient(90deg,transparent,rgba(124,58,237,0.8),transparent)',borderRadius:1}}/>

        {/* Icon + dynamic Title */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <div className="a-glow"><I.Shield /></div>
          <div style={{textAlign:'center'}}>
            <h1 className="grad-text" style={{fontSize:26,fontWeight:800,letterSpacing:'-0.02em'}}>
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p style={{color:'var(--text-sub)',fontSize:13,marginTop:5}}>
              {isLogin ? 'Sign in to access the Rate Limiter API' : 'Register to get your API access'}
            </p>
          </div>
        </div>

        {/* ── Mode toggle pills ── */}
        <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:10,padding:4,border:'1px solid var(--border)'}}>
          {(['login','register'] as const).map(m => (
            <button key={m} type="button" onClick={() => switchMode(m)}
              style={{flex:1,padding:'8px 0',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:600,transition:'all 0.2s',
                background: mode===m ? 'linear-gradient(135deg,#7c3aed,#6366f1)' : 'transparent',
                color: mode===m ? '#fff' : 'var(--text-sub)',
                boxShadow: mode===m ? '0 2px 12px rgba(124,58,237,0.4)' : 'none',
              }}>
              {m==='login' ? '🔑 Sign In' : '✨ Register'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {err && (
          <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,padding:'10px 14px',color:'#ef4444',fontSize:13,display:'flex',gap:8,alignItems:'center'}}>
            <I.Alert /><span>{err}</span>
          </div>
        )}

        {/* Username */}
        <div style={{position:'relative'}}>
          <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-sub)',pointerEvents:'none'}}><I.User /></span>
          <input id="auth-username" className="px-input" value={user} onChange={e=>setUser(e.target.value)}
            placeholder={isLogin ? 'Username' : 'Choose a username (letters, numbers, _)'}
            onKeyDown={e=>e.key==='Enter'&&(isLogin?login():register())} />
        </div>

        {/* Password + strength bar */}
        <div>
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-sub)',pointerEvents:'none'}}><I.Lock /></span>
            <input id="auth-password" className="px-input" type={showP?'text':'password'} value={pass}
              onChange={e=>setPass(e.target.value)}
              placeholder={isLogin ? 'Password' : 'Create a password (min 6 chars)'}
              style={{paddingRight:46}}
              onKeyDown={e=>e.key==='Enter'&&(isLogin?login():register())} />
            <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setShowP(p=>!p)}}
              style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,color:showP?'var(--violet)':'var(--text-sub)',cursor:'pointer',padding:'4px 6px',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
              {showP?<I.EyeO s={14}/>:<I.Eye s={14}/>}
            </button>
          </div>
          {!isLogin && pass.length > 0 && (
            <div style={{marginTop:8,display:'flex',alignItems:'center',gap:10}}>
              <div style={{flex:1,height:4,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:4,width:`${(strength/5)*100}%`,background:strengthColor,transition:'all 0.4s ease'}}/>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:strengthColor,minWidth:70}}>{strengthLabel}</span>
            </div>
          )}
        </div>

        {/* Confirm password (register only) */}
        {!isLogin && (
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',color:'var(--text-sub)',pointerEvents:'none'}}><I.Lock /></span>
            <input id="auth-confirm" className="px-input" type={showC?'text':'password'} value={confirm}
              onChange={e=>setConfirm(e.target.value)} placeholder="Confirm your password" style={{paddingRight:80}}
              onKeyDown={e=>e.key==='Enter'&&register()} />
            {confirm.length > 0 && (
              <span style={{position:'absolute',right:50,top:'50%',transform:'translateY(-50%)',fontSize:14}}>{confirm===pass?'✅':'❌'}</span>
            )}
            <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();setShowC(p=>!p)}}
              style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:6,color:showC?'var(--violet)':'var(--text-sub)',cursor:'pointer',padding:'4px 6px',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.2s'}}>
              {showC?<I.EyeO s={14}/>:<I.Eye s={14}/>}
            </button>
          </div>
        )}

        {/* Submit */}
        <button id="auth-submit-btn" type="button" onClick={isLogin?login:register} disabled={load}
          className="shimmer-btn"
          style={{background:load?'rgba(124,58,237,0.3)':'linear-gradient(135deg,#7c3aed,#6366f1)',color:'#fff',border:'none',borderRadius:12,padding:'14px 0',fontSize:15,fontWeight:700,cursor:load?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:9,boxShadow:load?'none':'0 0 32px rgba(124,58,237,0.4)',transition:'all 0.2s'}}>
          {load
            ? <><span className="a-spin" style={{display:'inline-block',width:16,height:16,border:'2px solid rgba(255,255,255,0.25)',borderTopColor:'#fff',borderRadius:'50%'}}/> {isLogin?'Signing in…':'Creating account…'}</>
            : isLogin ? <><I.Lock s={15}/> Sign In</> : <>✨ Create Account</>}
        </button>

        {/* Quick-fill cards (login only) */}
        {isLogin && (
          <div style={{background:'rgba(124,58,237,0.08)',border:'1px solid rgba(124,58,237,0.2)',borderRadius:10,padding:'14px',display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'var(--violet)'}}><I.Key /></span>
              <strong style={{color:'var(--text)',fontSize:13}}>Quick Sign-In</strong>
              <span style={{fontSize:11,color:'var(--text-sub)',marginLeft:'auto'}}>click to auto-fill</span>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button type="button" onClick={e=>{e.preventDefault();setUser('admin');setPass('admin123')}}
                style={{flex:1,display:'flex',flexDirection:'column',alignItems:'flex-start',background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.25)',borderRadius:8,padding:'9px 12px',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',gap:3}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(124,58,237,0.2)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(124,58,237,0.1)'}>
                <span style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>admin</span>
                <span style={{fontSize:10.5,color:'var(--text-sub)',fontFamily:'monospace'}}>admin123</span>
              </button>
              <button type="button" onClick={e=>{e.preventDefault();setUser('demo');setPass('demo123')}}
                style={{flex:1,display:'flex',flexDirection:'column',alignItems:'flex-start',background:'rgba(34,197,94,0.07)',border:'1px solid rgba(34,197,94,0.2)',borderRadius:8,padding:'9px 12px',cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s',gap:3}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(34,197,94,0.15)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(34,197,94,0.07)'}>
                <span style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>demo</span>
                <span style={{fontSize:10.5,color:'var(--text-sub)',fontFamily:'monospace'}}>demo123</span>
              </button>
            </div>
          </div>
        )}

        {/* Switch mode link */}
        <p style={{textAlign:'center',fontSize:12.5,color:'var(--text-sub)'}}>
          {isLogin
            ? <>No account? <button type="button" onClick={()=>switchMode('register')} style={{background:'none',border:'none',color:'#a78bfa',cursor:'pointer',fontFamily:'inherit',fontSize:12.5,fontWeight:600,textDecoration:'underline'}}>Create one free →</button></>
            : <>Already have one? <button type="button" onClick={()=>switchMode('login')} style={{background:'none',border:'none',color:'#a78bfa',cursor:'pointer',fontFamily:'inherit',fontSize:12.5,fontWeight:600,textDecoration:'underline'}}>Sign in →</button></>
          }
        </p>
      </div>
    </div>
  )
}

// ── JWT Sidebar Section ────────────────────────────────────────────────────────
function JwtSection({ auth, onLogout }: { auth:AuthState; onLogout:()=>void }) {
  const [copied, setCopied] = useState(false)
  const [showDec, setShowDec] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')
  const parts = auth.token.split('.')
  const decoded = decodeJwt(auth.token)

  useEffect(() => {
    const fmt = () => { const ms=auth.expiresAt-Date.now(); if(ms<=0){setTimeLeft('expired');return}; const m=Math.floor(ms/60000),s=Math.floor((ms%60000)/1000); setTimeLeft(`${m}m ${s}s`) }
    fmt(); const id=setInterval(fmt,1000); return ()=>clearInterval(id)
  },[auth.expiresAt])

  const copy = () => { navigator.clipboard.writeText(auth.token); setCopied(true); setTimeout(()=>setCopied(false),2e3) }

  return (
    <div style={{margin:'8px 0',borderTop:'1px solid var(--border)',paddingTop:12}}>
      {/* Header */}
      <div style={{padding:'6px 16px 10px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span className="pulse"/>
          <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-sub)'}}>JWT TOKEN</span>
        </div>
        <span style={{fontSize:11,color:'#22c55e',fontWeight:600,fontFamily:'monospace'}}>{timeLeft}</span>
      </div>

      {/* Token display with JWT.io colors */}
      <div style={{margin:'0 12px',background:'rgba(8,8,20,0.9)',border:'1px solid var(--border)',borderRadius:10,padding:'12px',position:'relative'}}>
        <div style={{fontFamily:'JetBrains Mono,Fira Code,monospace',fontSize:10.5,lineHeight:1.5,wordBreak:'break-all',userSelect:'all'}}>
          <span className="jwt-h">{parts[0]}</span>
          <span style={{color:'rgba(255,255,255,0.3)'}}>.</span>
          <span className="jwt-p">{parts[1]}</span>
          <span style={{color:'rgba(255,255,255,0.3)'}}>.</span>
          <span className="jwt-s">{parts[2]}</span>
        </div>
        {/* Color legend */}
        <div style={{display:'flex',gap:10,marginTop:10,paddingTop:8,borderTop:'1px solid var(--border)',flexWrap:'wrap'}}>
          {[['Header','var(--jwt-header)'],['Payload','var(--jwt-payload)'],['Signature','var(--jwt-signature)']].map(([l,c])=>(
            <span key={l} style={{fontSize:9.5,fontWeight:700,color:c,letterSpacing:'0.06em'}}>{l}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,padding:'10px 12px 0'}}>
        <button onClick={copy} style={{flex:1,display:'flex',justifyContent:'center',alignItems:'center',gap:6,background:copied?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.05)',border:`1px solid ${copied?'rgba(34,197,94,0.3)':'var(--border)'}`,borderRadius:8,padding:'7px 0',color:copied?'#22c55e':'var(--text-sub)',fontSize:12,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
          {copied?<I.Check s={13}/>:<I.Copy s={13}/>} {copied?'Copied!':'Copy Token'}
        </button>
        <button onClick={()=>setShowDec(!showDec)} style={{display:'flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.05)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',color:'var(--text-sub)',fontSize:12,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
          <I.ChevD/> {showDec?'Hide':'Decode'}
        </button>
      </div>

      {/* Decoded view */}
      {showDec && decoded && (
        <div className="a-slide" style={{margin:'10px 12px 0',background:'rgba(8,8,20,0.8)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
          {[['HEADER',decoded.header,'var(--jwt-header)'],['PAYLOAD',decoded.payload,'var(--jwt-payload)']].map(([label, obj, color])=>(
            <div key={label as string} style={{padding:'10px 12px',borderBottom:'1px solid var(--border)'}}>
              <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',color:color as string,marginBottom:6}}>{label as string}</p>
              <pre style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:'var(--text-sub)',lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-all'}}
                dangerouslySetInnerHTML={{__html:syntaxHighlight(JSON.stringify(obj as object,null,2))}}/>
            </div>
          ))}
        </div>
      )}

      {/* Logout */}
      <div style={{padding:'10px 12px 4px'}}>
        <button onClick={onLogout} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:7,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:8,padding:'8px 0',color:'#ef4444',fontSize:12,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.15)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.08)'}>
          <I.Logout /> Logout
        </button>
      </div>
    </div>
  )
}

// ── Stats Tab ──────────────────────────────────────────────────────────────────
function StatsTab({ auth, addToast }: { auth:AuthState; addToast:(t:ToastItem['type'],ti:string,m:string)=>void }) {
  const [stats, setStats] = useState<UserStat[]>([])
  const [load, setLoad] = useState(true)

  const fetch_ = useCallback(async () => {
    setLoad(true)
    try {
      const r = await fetch('/api/stats',{headers:{Authorization:`Bearer ${auth.token}`}})
      const d = await r.json(); setStats(d.stats??[])
    } catch { addToast('error','Fetch Failed','Could not load stats') }
    finally { setLoad(false) }
  },[auth])

  useEffect(()=>{ fetch_() },[])

  const total   = stats.reduce((s,u)=>s+u.totalRequests,0)
  const success = stats.reduce((s,u)=>s+u.successfulRequests,0)
  const blocked = stats.reduce((s,u)=>s+u.rateLimitedRequests,0)

  return (
    <div style={{flex:1,overflowY:'auto',padding:28}}>
      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
        {[{l:'Total Requests',v:total,c:'#818cf8'},{l:'Successful',v:success,c:'#22c55e'},{l:'Rate Limited',v:blocked,c:'#ef4444'}].map(({l,v,c})=>(
          <div key={l} className="a-slide" style={{background:'var(--panel-bg)',border:'1px solid var(--border)',borderRadius:16,padding:'20px 24px',transition:'border-color 0.2s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=c+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <p style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-sub)',textTransform:'uppercase',marginBottom:8}}>{l}</p>
            <p style={{fontSize:36,fontWeight:800,color:c,letterSpacing:'-0.02em'}}>{v}</p>
          </div>
        ))}
      </div>

      {/* Table head  */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <h2 style={{fontSize:15,fontWeight:600,color:'var(--text)'}}>Per-User Stats <span style={{color:'var(--text-sub)',fontWeight:400,fontSize:13}}>— MySQL</span></h2>
        <button onClick={fetch_} disabled={load} style={{display:'flex',alignItems:'center',gap:7,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.25)',borderRadius:8,color:'#a78bfa',padding:'6px 14px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
          <span className={load?'a-spin':''}><I.Refresh/></span>{load?'Loading…':'Refresh'}
        </button>
      </div>

      {/* Table */}
      {stats.length===0 ? (
        <div style={{background:'var(--panel-bg)',border:'1px solid var(--border)',borderRadius:16,padding:50,textAlign:'center',color:'var(--text-sub)'}}>
          <div style={{fontSize:36,marginBottom:12}}>📊</div>
          <p>No requests yet. Use the API Tester to send some.</p>
        </div>
      ) : (
        <div style={{background:'var(--panel-bg)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'rgba(124,58,237,0.07)',borderBottom:'1px solid var(--border)'}}>
              {['User ID','Total','✓ Success','✗ Blocked','Rate','Last Request'].map(h=>(
                <th key={h} style={{padding:'12px 20px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-sub)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {stats.map((u,i)=>{
                const rate = u.totalRequests?Math.round(u.successfulRequests/u.totalRequests*100):0
                return (
                  <tr key={u.userId} style={{borderBottom:i<stats.length-1?'1px solid var(--border)':'none',transition:'background 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'13px 20px'}}><code style={{color:'#a78bfa',fontSize:13}}>{u.userId}</code></td>
                    <td style={{padding:'13px 20px',color:'var(--text)',fontWeight:600}}>{u.totalRequests}</td>
                    <td style={{padding:'13px 20px',color:'#22c55e',fontWeight:600}}>{u.successfulRequests}</td>
                    <td style={{padding:'13px 20px',color:u.rateLimitedRequests>0?'#ef4444':'var(--text-sub)',fontWeight:600}}>{u.rateLimitedRequests}</td>
                    <td style={{padding:'13px 20px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:80,height:5,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:3,width:`${rate}%`,background:rate>80?'#22c55e':rate>50?'#f97316':'#ef4444',transition:'width 0.6s ease'}}/>
                        </div>
                        <span style={{color:'var(--text-sub)',fontSize:12,fontWeight:600}}>{rate}%</span>
                      </div>
                    </td>
                    <td style={{padding:'13px 20px',color:'var(--text-sub)',fontSize:12}}>{u.lastRequestAt?new Date(u.lastRequestAt).toLocaleTimeString():'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Docs Tab ───────────────────────────────────────────────────────────────────
function DocsTab() {
  const [copied, setCopied] = useState<string|null>(null)
  const cp = (code:string,id:string)=>{ navigator.clipboard.writeText(code); setCopied(id); setTimeout(()=>setCopied(null),1800) }

  const endpoints = [
    { method:'POST', path:'/api/auth/login', badge:'m-post', auth:false, desc:'Get a JWT token (valid 1 hour). Use the token in the Authorization header for all protected routes.',
      curl:`curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}'`,
      resp:`200 OK\n{\n  "token": "eyJhbGci...",\n  "expiresAt": 1700000000000,\n  "user": { "id": "uuid", "username": "admin" }\n}` },
    { method:'POST', path:'/api/request', badge:'m-post', auth:true, desc:'Submit a request for a specific user_id. Rate-limited to 5 requests per user per minute using a sliding window. Every call is persisted to MySQL.',
      curl:`curl -X POST http://localhost:3000/api/request \\
  -H "Authorization: Bearer eyJhbGci..." \\
  -H "Content-Type: application/json" \\
  -d '{"user_id":"user_001","payload":{"action":"fetch_data"}}'`,
      resp:`200 OK\n{ "success":true, "requestId":"uuid", "remainingRequests":4 }\n\n429 Too Many Requests\n{ "error":"Rate limit exceeded", "retryAfter":"60 seconds" }` },
    { method:'GET', path:'/api/stats', badge:'m-get', auth:true, desc:'Returns stats for all users from MySQL. Add ?user_id= param to filter one user. Data persists across restarts.',
      curl:`# All users\ncurl http://localhost:3000/api/stats \\\n  -H "Authorization: Bearer eyJhbGci..."\n\n# Single user\ncurl "http://localhost:3000/api/stats?user_id=user_001" \\\n  -H "Authorization: Bearer eyJhbGci..."`,
      resp:`200 OK\n{\n  "totalUsers": 2,\n  "stats": [\n    { "userId":"user_001", "totalRequests":7, "successfulRequests":5, "rateLimitedRequests":2 }\n  ]\n}` },
  ]

  return (
    <div style={{flex:1,overflowY:'auto',padding:28,display:'flex',flexDirection:'column',gap:20}}>
      {endpoints.map((ep,i)=>(
        <div key={ep.path} className="a-slide" style={{background:'var(--panel-bg)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',animationDelay:`${i*0.08}s`}}>
          <div style={{padding:'18px 22px',display:'flex',alignItems:'center',gap:12,borderBottom:'1px solid var(--border)'}}>
            <span className={ep.badge} style={{padding:'3px 10px',borderRadius:6,fontFamily:'monospace',fontSize:12,fontWeight:700}}>{ep.method}</span>
            <code style={{color:'#a78bfa',fontSize:14,fontWeight:600}}>{ep.path}</code>
            {ep.auth&&<span style={{background:'rgba(239,68,68,0.1)',color:'#ef4444',border:'1px solid rgba(239,68,68,0.25)',borderRadius:6,padding:'2px 9px',fontSize:11,fontWeight:600}}>🔒 JWT Required</span>}
          </div>
          <div style={{padding:'16px 22px',display:'flex',flexDirection:'column',gap:14}}>
            <p style={{color:'var(--text-sub)',fontSize:13.5,lineHeight:1.7}}>{ep.desc}</p>
            <div>
              <p style={{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--text-sub)',marginBottom:8}}>CURL EXAMPLE</p>
              <div style={{position:'relative'}}>
                <button onClick={()=>cp(ep.curl,ep.path+'-curl')} style={{position:'absolute',top:10,right:10,zIndex:1,background:copied===ep.path+'-curl'?'rgba(34,197,94,0.15)':'rgba(255,255,255,0.06)',color:copied===ep.path+'-curl'?'#22c55e':'var(--text-sub)',border:`1px solid ${copied===ep.path+'-curl'?'rgba(34,197,94,0.3)':'var(--border)'}`,borderRadius:6,padding:'4px 10px',fontSize:11,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                  {copied===ep.path+'-curl'?'✓ Copied':'Copy'}
                </button>
                <pre className="code-pre">{ep.curl}</pre>
              </div>
            </div>
            <div>
              <p style={{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--text-sub)',marginBottom:8}}>RESPONSE</p>
              <pre className="code-pre" dangerouslySetInnerHTML={{__html:syntaxHighlight(ep.resp)}}/>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [auth,      setAuth]      = useState<AuthState|null>(null)
  const [tab,       setTab]       = useState<Tid>('tester')
  const [selEp,     setSelEp]     = useState<Endpoint>(ENDPOINTS[0])
  const [bodyText,  setBodyText]  = useState(ENDPOINTS[0].defaultBody??'')
  const [urlPath,   setUrlPath]   = useState(ENDPOINTS[0].path)
  const [reqTab,    setReqTab]    = useState<ReqTab>('body')
  const [resTab,    setResTab]    = useState<ResTab>('body')
  const [response,  setResponse]  = useState<ResponseData|null>(null)
  const [loading,   setLoading]   = useState(false)
  const [toasts,    setToasts]    = useState<ToastItem[]>([])

  // Restore session
  useEffect(()=>{ try { const r=JSON.parse(localStorage.getItem('sa_auth')||''); if(r?.expiresAt>Date.now()) setAuth(r) } catch {} },[])

  const addToast = useCallback((type:ToastItem['type'],title:string,message:string)=>{ const id=crypto.randomUUID(); setToasts(p=>[...p,{id,type,title,message}]); setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),4300) },[])
  const removeToast = (id:string) => setToasts(p=>p.filter(t=>t.id!==id))

  const handleLogin = (a:AuthState) => { setAuth(a); localStorage.setItem('sa_auth',JSON.stringify(a)); addToast('success','Authenticated!',`Welcome, ${a.username}`) }
  const handleLogout = () => { setAuth(null); localStorage.removeItem('sa_auth'); addToast('info','Logged out','Session ended.') }

  const selectEndpoint = (ep:Endpoint) => { setSelEp(ep); setBodyText(ep.defaultBody??''); setUrlPath(ep.path); setResponse(null); setReqTab(ep.method==='GET'?'auth':'body') }

  // Send request
  const send = async () => {
    if (selEp.requiresAuth && !auth) { addToast('error','Not Authenticated','Run the Login endpoint first.'); return }
    setLoading(true); setResponse(null)
    const t0 = Date.now()
    try {
      const hdrs: Record<string,string> = {'Content-Type':'application/json'}
      if (selEp.requiresAuth && auth) hdrs['Authorization'] = `Bearer ${auth.token}`
      const opts: RequestInit = { method: selEp.method, headers: hdrs }
      if (selEp.method!=='GET' && bodyText.trim()) opts.body = bodyText
      const res = await fetch(urlPath, opts)
      const timeMs = Date.now()-t0, text = await res.text()
      let bodyFmt = text; try { bodyFmt=JSON.stringify(JSON.parse(text),null,2) } catch {}
      const headers: [string,string][] = []; res.headers.forEach((v,k)=>headers.push([k,v]))
      setResponse({ status:res.status, body:text, bodyFmt, headers, timeMs })
      setResTab('body')

      // Auto-login if login endpoint succeeded
      if (selEp.id==='login' && res.ok) {
        try { const d=JSON.parse(text); if(d.token) handleLogin({token:d.token,username:d.user.username,expiresAt:d.expiresAt}) } catch {}
      }
      if (res.status===429)       addToast('error',  '429 Rate Limited',    'Request blocked — limit reached')
      else if (res.status===401)  addToast('warning','401 Unauthorized',     'Token missing or expired')
      else if (res.ok)            addToast('success', `${res.status} ${statusLabel(res.status)}`,'Response received ✓')
    } catch { addToast('error','Network Error','Could not reach the server.') }
    finally { setLoading(false) }
  }

  // ── Header nav style ──
  const navBtn = (t:Tid) => ({
    display:'flex' as const, alignItems:'center' as const, gap:6, padding:'7px 16px', border:'none', background:'transparent',
    color: tab===t?'var(--text)':'var(--text-sub)', fontSize:13,
    borderBottom: `2px solid ${tab===t?'var(--violet)':'transparent'}`, cursor:'pointer',
    fontWeight: tab===t?600:400, fontFamily:'inherit', transition:'all 0.2s', marginBottom:-1,
  })

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden',background:'var(--app-bg)',position:'relative'}}>
      {/* Background (fixed) */}
      <div style={{position:'fixed',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:0}}>
        <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/><div className="grid-bg"/>
      </div>

      {/* Toasts */}
      <Toasts items={toasts} remove={removeToast}/>

      {/* Login modal */}
      {!auth && <LoginModal onLogin={handleLogin}/>}

      {/* App (shown when authenticated) */}
      {auth && (
        <>
          {/* ── Header ── */}
          <header style={{position:'relative',zIndex:10,flexShrink:0,height:54,display:'flex',alignItems:'stretch',background:'rgba(11,11,22,0.96)',borderBottom:'1px solid var(--border)',backdropFilter:'blur(16px)',padding:'0 20px'}}>
            {/* Logo */}
            <div style={{display:'flex',alignItems:'center',gap:10,paddingRight:24,borderRight:'1px solid var(--border)'}}>
              <div className="a-glow" style={{width:34,height:34,borderRadius:9,background:'rgba(124,58,237,0.15)',border:'1px solid rgba(124,58,237,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}><I.Lightning /></div>
              <div>
                <p style={{fontSize:13,fontWeight:700,color:'var(--text)',lineHeight:1}}>Source Asia</p>
                <p style={{fontSize:10,color:'var(--text-sub)',lineHeight:1,marginTop:2}}>Rate Limiter API</p>
              </div>
            </div>

            {/* Nav tabs */}
            <nav style={{display:'flex',alignItems:'stretch',paddingLeft:8,borderBottom:'none',gap:0}}>
              {([['tester',<I.Send/>, 'API Tester'],['stats',<I.Chart/>,'Stats'],['docs',<I.Book/>,'Docs']] as [Tid,React.ReactNode,string][]).map(([t,ico,label])=>(
                <button key={t} onClick={()=>setTab(t)} style={navBtn(t)}>{ico}{label}</button>
              ))}
            </nav>

            {/* User badge */}
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10}}>
              <div style={{display:'flex',alignItems:'center',gap:8,background:'rgba(124,58,237,0.1)',border:'1px solid rgba(124,58,237,0.2)',borderRadius:8,padding:'5px 12px'}}>
                <span className="pulse"/>
                <I.User s={13}/>
                <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{auth.username}</span>
              </div>
            </div>
          </header>

          {/* ── Body ── */}
          <div style={{display:'flex',flex:1,overflow:'hidden',position:'relative',zIndex:1}}>

            {/* ═══ API TESTER: Sidebar ═══ */}
            {tab==='tester' && (
              <aside style={{width:240,flexShrink:0,background:'var(--sidebar-bg)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflowY:'auto'}}>
                <div style={{padding:'14px 16px 8px'}}>
                  <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'var(--text-sub)'}}>COLLECTION</p>
                </div>

                {ENDPOINTS.map(ep=>(
                  <div key={ep.id} className={`ep-item ${selEp.id===ep.id?'active':''}`} onClick={()=>selectEndpoint(ep)}>
                    <span className={ep.method==='POST'?'m-post':'m-get'} style={{fontSize:9.5,fontWeight:800,padding:'2px 7px',borderRadius:5,letterSpacing:'0.04em',flexShrink:0}}>{ep.method}</span>
                    <div style={{overflow:'hidden'}}>
                      <p style={{fontSize:12.5,fontWeight:selEp.id===ep.id?600:400,color:selEp.id===ep.id?'var(--text)':'var(--text-sub)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ep.name}</p>
                      <p style={{fontSize:10.5,color:'var(--text-muted)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',marginTop:1}}>{ep.desc}</p>
                    </div>
                  </div>
                ))}

                {/* JWT section */}
                <div style={{flex:1}}/>
                <JwtSection auth={auth} onLogout={handleLogout}/>
              </aside>
            )}

            {/* ═══ API TESTER: Main ═══ */}
            {tab==='tester' && (
              <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

                {/* ── URL Bar ── */}
                <div style={{flexShrink:0,padding:'12px 16px',background:'var(--panel-bg)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                  <span className={selEp.method==='POST'?'m-post':'m-get'} style={{padding:'7px 14px',borderRadius:8,fontFamily:'monospace',fontWeight:800,fontSize:13,flexShrink:0,whiteSpace:'nowrap'}}>{selEp.method}</span>
                  <input value={urlPath} onChange={e=>setUrlPath(e.target.value)}
                    style={{flex:1,background:'var(--input-bg)',border:'1px solid var(--border)',borderRadius:9,padding:'9px 14px',color:'#a78bfa',fontFamily:'JetBrains Mono,monospace',fontSize:13,outline:'none',transition:'border-color 0.2s'}}
                    onFocus={e=>e.target.style.borderColor='var(--violet)'}
                    onBlur={e=>e.target.style.borderColor='var(--border)'}/>
                  <button id="send-request-btn" onClick={send} disabled={loading} className="shimmer-btn" style={{flexShrink:0,display:'flex',alignItems:'center',gap:8,background:loading?'rgba(124,58,237,0.35)':'linear-gradient(135deg,#7c3aed,#6366f1)',color:'#fff',border:'none',borderRadius:9,padding:'9px 24px',fontSize:14,fontWeight:700,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 0 24px rgba(124,58,237,0.5)',transition:'all 0.2s',whiteSpace:'nowrap'}}>
                    {loading?<><span className="a-spin" style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%'}}/>Sending…</>:<><I.Send/>Send</>}
                  </button>
                </div>

                {/* ── Request Tabs ── */}
                <div style={{flexShrink:0,background:'var(--panel-bg)',borderBottom:'1px solid var(--border)'}}>
                  <div className="tab-ul">
                    {(['body','auth','headers'] as ReqTab[]).map(t=>(
                      <button key={t} className={reqTab===t?'active':''} onClick={()=>setReqTab(t)}>
                        {t==='body'?'Body':t==='auth'?'🔑 Auth':'Headers'}
                        {t==='auth'&&auth&&<span style={{marginLeft:6,display:'inline-block',width:6,height:6,borderRadius:'50%',background:'#22c55e',verticalAlign:'middle'}}/>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Request Body ── */}
                <div style={{flexShrink:0,background:'var(--panel-bg)',borderBottom:'1px solid var(--border)',overflow:'hidden'}}>
                  {reqTab==='body' && (
                    <textarea id="payload-input" value={bodyText} onChange={e=>setBodyText(e.target.value)}
                      disabled={selEp.method==='GET'}
                      style={{width:'100%',height:160,background:selEp.method==='GET'?'rgba(0,0,0,0.2)':'var(--input-bg)',border:'none',resize:'none',padding:'14px 16px',color:selEp.method==='GET'?'var(--text-muted)':'#a5d6ff',fontFamily:'JetBrains Mono,Fira Code,monospace',fontSize:13,lineHeight:1.6,outline:'none'}}
                      placeholder={selEp.method==='GET'?'GET request — no body required':'// JSON request body'}/>
                  )}
                  {reqTab==='auth' && (
                    <div style={{padding:16}}>
                      <p style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-sub)',marginBottom:12}}>BEARER TOKEN</p>
                      {auth ? (
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                            <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#22c55e'}}/>
                            <span style={{color:'#22c55e',fontSize:13,fontWeight:600}}>Token Active — auto-added to request</span>
                          </div>
                          <div style={{background:'rgba(8,8,20,0.9)',border:'1px solid var(--border)',borderRadius:10,padding:12,fontFamily:'JetBrains Mono,monospace',fontSize:11,lineHeight:1.5,wordBreak:'break-all'}}>
                            <span style={{color:'var(--text-sub)'}}>Authorization: Bearer </span>
                            <span className="jwt-h">{auth.token.split('.')[0]}</span>
                            <span style={{color:'rgba(255,255,255,0.2)'}}>.</span>
                            <span className="jwt-p">{auth.token.split('.')[1]}</span>
                            <span style={{color:'rgba(255,255,255,0.2)'}}>.</span>
                            <span className="jwt-s">{auth.token.split('.')[2]?.slice(0,20)}…</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{background:'rgba(249,115,22,0.08)',border:'1px solid rgba(249,115,22,0.25)',borderRadius:10,padding:'12px 14px',color:'#f97316',fontSize:13,display:'flex',gap:8,alignItems:'center'}}>
                          <I.Alert/> No token — run the <strong>Login</strong> endpoint first
                        </div>
                      )}
                    </div>
                  )}
                  {reqTab==='headers' && (
                    <div style={{padding:16}}>
                      <p style={{fontSize:11,fontWeight:700,letterSpacing:'0.08em',color:'var(--text-sub)',marginBottom:12}}>REQUEST HEADERS</p>
                      <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'JetBrains Mono,monospace',fontSize:12}}>
                        <tbody>
                          {[['Content-Type','application/json'],...(selEp.requiresAuth&&auth?[['Authorization','Bearer '+auth.token.slice(0,30)+'…']]:[] as [string,string][])].map(([k,v])=>(
                            <tr key={k} style={{borderBottom:'1px solid var(--border)'}}>
                              <td style={{padding:'8px 12px',color:'#79c0ff',width:180}}>{k}</td>
                              <td style={{padding:'8px 12px',color:'var(--text-sub)',wordBreak:'break-all'}}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ── Response Panel ── */}
                <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--app-bg)'}}>
                  {!response && !loading ? (
                    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,color:'var(--text-muted)'}}>
                      <div style={{fontSize:48,opacity:0.3}}>📭</div>
                      <p style={{fontSize:14}}>Hit <strong style={{color:'var(--violet)'}}>Send</strong> to get a response</p>
                    </div>
                  ) : loading ? (
                    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:14,color:'var(--text-sub)'}}>
                      <span className="a-spin" style={{display:'inline-block',width:24,height:24,border:'2px solid rgba(124,58,237,0.2)',borderTopColor:'var(--violet)',borderRadius:'50%'}}/>
                      <span style={{fontSize:14}}>Waiting for response…</span>
                    </div>
                  ) : response && (
                    <>
                      {/* Status bar */}
                      <div style={{flexShrink:0,padding:'10px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14,background:'var(--panel-bg)'}}>
                        <span className={statusClass(response.status)} style={{padding:'5px 14px',borderRadius:8,fontFamily:'monospace',fontWeight:800,fontSize:15}}>
                          {response.status} {statusLabel(response.status)}
                        </span>
                        <span style={{background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',borderRadius:8,padding:'4px 12px',fontSize:12,color:'var(--text-sub)',fontWeight:600}}>{response.timeMs} ms</span>
                        <span style={{background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',borderRadius:8,padding:'4px 12px',fontSize:12,color:'var(--text-sub)',fontWeight:600}}>{fmtBytes(response.body.length)}</span>
                        {response.status===429 && (
                          <span style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:8,padding:'4px 12px',fontSize:12,color:'#ef4444',fontWeight:600}}>⚡ Rate limit exceeded</span>
                        )}
                      </div>

                      {/* Response tabs */}
                      <div style={{flexShrink:0,borderBottom:'1px solid var(--border)'}}>
                        <div className="tab-ul">
                          {(['body','headers'] as ResTab[]).map(t=>(
                            <button key={t} className={resTab===t?'active':''} onClick={()=>setResTab(t)}>{t==='body'?'Body': `Headers (${response.headers.length})`}</button>
                          ))}
                        </div>
                      </div>

                      {/* Response body */}
                      <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
                        {resTab==='body' && (
                          <div style={{position:'relative'}}>
                            <button onClick={()=>navigator.clipboard.writeText(response.bodyFmt)} style={{position:'absolute',top:10,right:10,zIndex:1,background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',borderRadius:6,padding:'4px 10px',color:'var(--text-sub)',fontSize:11,cursor:'pointer',fontFamily:'inherit'}}>Copy</button>
                            <pre className="code-pre" dangerouslySetInnerHTML={{__html:syntaxHighlight(response.bodyFmt)}} style={{paddingTop:36}}/>
                          </div>
                        )}
                        {resTab==='headers' && (
                          <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'JetBrains Mono,monospace',fontSize:12}}>
                            <tbody>
                              {response.headers.map(([k,v])=>(
                                <tr key={k} style={{borderBottom:'1px solid var(--border)'}}
                                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                  <td style={{padding:'9px 12px',color:'#79c0ff',width:240,fontWeight:600}}>{k}</td>
                                  <td style={{padding:'9px 12px',color:'var(--text-sub)',wordBreak:'break-all'}}>{v}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </main>
            )}

            {/* ═══ STATS TAB ═══ */}
            {tab==='stats' && <StatsTab auth={auth} addToast={addToast}/>}

            {/* ═══ DOCS TAB ═══ */}
            {tab==='docs' && <DocsTab/>}
          </div>
        </>
      )}
    </div>
  )
}
