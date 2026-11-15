import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import Brand from '../components/Brand'
import LanguagePicker from '../components/LanguagePicker'
import {useI18n} from '../lib/i18n'
import { useAuth } from '../components/AuthProvider'
import { isDemoUser } from '../lib/demo'
import { ApiError, sessionApi } from '../lib/api'

type Mode = 'login'|'register'|'forgot'|'reset'
export function AuthPage({mode}:{mode:Mode}) {
  const navigate=useNavigate()
  const {t}=useI18n()
  const {user,setUser}=useAuth()
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [agree,setAgree]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  if (user && !isDemoUser(user) && (mode==='login'||mode==='register')) return <Navigate to="/app" replace />
  const submit = async(e:FormEvent)=>{
    e.preventDefault();setError('');setMessage('');setBusy(true)
    try {
      if(mode==='login'){setUser(await sessionApi.login(email,password));navigate('/app')}
      if(mode==='register'){setUser(await sessionApi.register(name,email,password,agree));navigate('/app')}
      if(mode==='forgot'){const r=await sessionApi.forgot(email);setMessage(r.message)}
      if(mode==='reset'){
        const token = new URLSearchParams(location.hash.slice(1)).get('token')||''
        const r=await sessionApi.reset(token,password);setMessage(r.message);setPassword('')
        history.replaceState({},'',location.pathname)
      }
    }catch(err){setError(err instanceof ApiError?err.message:'Não foi possível concluir. Tente novamente.')}
    finally{setBusy(false)}
  }
  const title = {login:'Bem-vindo de volta.',register:'Comece pela sua terra.',forgot:'Recupere seu acesso.',reset:'Defina uma nova senha.'}[mode]
  return <div className="auth-layout">
    <div className="auth-side" style={{backgroundImage:'url(/auth-satellite.jpg)'}}>
      <div className="auth-side-top"><Brand onDark/><span className="eyebrow">NASA SPACE APPS 2026 / FIELD SHIFT</span></div>
      <div className="auth-intro"><span className="auth-line"/><h1>{t('O futuro da')}<br/>{t('sua terra começa')}<br/><em>{t('com uma escolha.')}</em></h1><p>{t('Dados geoespaciais, planejamento agrícola e decisões mais conscientes — em um só lugar.')}</p></div>
      <div className="auth-side-footer"><span>{t('20 ANOS DE DADOS NASA · 31 CULTURAS')}</span></div>
    </div>
    <main className="auth-panel"><div className="auth-language-row"><LanguagePicker/></div>
      <div className="auth-mobile-brand"><Brand /></div>
      <div className="auth-box">
        <h2>{t(title)}</h2>
        <p className="auth-subtitle">{t({login:'Acesse suas propriedades e continue de onde parou.',register:'Crie uma conta e comece a mapear suas propriedades.',forgot:'Enviaremos um link temporário para seu e-mail cadastrado.',reset:'Sua nova senha deve conter pelo menos 10 caracteres.'}[mode])}</p>
        <form onSubmit={submit} className="auth-form">
          {mode==='register'&&<label>{t('Nome completo')}<input required autoComplete="name" minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder={t('Como podemos chamar você?')} /></label>}
          {mode!=='reset'&&<label>{t('E-mail')}<span className="field-with-icon"><Mail size={17}/><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t('seuemail@exemplo.com')}/></span></label>}
          {mode!=='forgot'&&<label>{t(mode==='login'?'Senha':'Senha (mínimo 10 caracteres)')}<span className="field-with-icon"><LockKeyhole size={17}/><input required minLength={mode==='login'?1:10} maxLength={128} type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••"/><button type="button" className="field-icon-btn" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Ocultar senha':'Mostrar senha'}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span></label>}
          {mode==='register' && <label className="check-label"><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} required/> <span>{t('Li o')} <Link to="/privacy" target="_blank">{t('aviso de privacidade')}</Link> {t('e estou ciente de como meus dados serão utilizados.')}</span></label>}
          {mode==='login'&&<div className="form-inline end"><Link to="/forgot-password">{t('Esqueci minha senha')}</Link></div>}
          {error&&<p className="form-error" role="alert">{error}</p>}
          {message&&<p className="form-success" role="status">{message}</p>}
          <button className="btn btn-primary btn-wide" type="submit" disabled={busy}>{t(busy?'Processando...':{login:'Entrar na plataforma',register:'Criar minha conta',forgot:'Enviar link de recuperação',reset:'Redefinir senha'}[mode])} <ArrowRight size={17}/></button>
        </form>
        {(mode==='login'||mode==='register')&&<><div className="auth-divider"><span>{t('ou')}</span></div><a className="btn btn-outline btn-wide auth-demo" href="/demo">{t('Explorar a demonstração sem conta')} <ArrowRight size={16}/></a></>}
        <div className="auth-switch">{mode==='login'?<>{t('Ainda não tem conta?')} <Link to="/register">{t('Cadastre-se')}</Link></>:mode==='register'?<>{t('Já tem conta?')} <Link to="/login">{t('Fazer login')}</Link></>:<>{t('Lembrou sua senha?')} <Link to="/login">{t('Voltar ao login')}</Link></>}</div>
        <p className="security-foot"><ShieldCheck size={15}/> {t('Seus dados são privados e acessíveis apenas à sua conta.')}</p>
      </div>
    </main>
  </div>
}
