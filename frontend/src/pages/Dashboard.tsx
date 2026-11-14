import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowDownToLine, ArrowRight, Bell, CalendarClock, Check, ChevronDown, Cloud, CloudRain, Compass, Edit3, Ellipsis, ExternalLink, Layers3, Leaf, LogOut, Map, MapPin, Menu, Mountain, Plus, RefreshCw, Ruler, Search, Settings2, ShieldCheck, Sparkles, Sprout, ThermometerSun, Trash2, UserRound, Wind, X } from 'lucide-react'
import Brand from '../components/Brand'
import FarmForm from '../components/FarmForm'
import TerrainPlot from '../components/TerrainPlot'
import {TerrainMapView,type ViewMode} from '../components/TerrainMapView'
import LanguagePicker from '../components/LanguagePicker'
import {useI18n} from '../lib/i18n'
import {LAYERS,getLayer} from '../lib/layers'
import { Timeline, monthName } from '../components/Timeline'
import { Assistant } from '../components/Assistant'
import { useAuth } from '../components/AuthProvider'
import { api, farmApi, ApiError } from '../lib/api'
import { formatCoord, formatHa } from '../lib/geo'
import { useViewStore } from '../lib/viewStore'
import type { Farm, FarmInput, WeatherLayer } from '../types'

const textureNames:Record<string,string>={unknown:'Não informada',sandy:'Arenoso',loamy:'Franco',clayey:'Argiloso',silty:'Siltoso'}
const irrigationNames:Record<string,string>={unknown:'Não informado',rainfed:'Sequeiro',irrigated:'Irrigado',mixed:'Misto'}

export default function Dashboard(){
  const {user,logout}=useAuth()
  const {t}=useI18n()
  const [viewMode,setViewMode]=useState<ViewMode>('3d')
  const [showMarkers,setShowMarkers]=useState(true)
  const navigate=useNavigate(),queryClient=useQueryClient()
  const farmsQuery=useQuery({queryKey:['farms'],queryFn:farmApi.list})
  const farms=farmsQuery.data||[]
  const selectedFarmId=useViewStore(s=>s.selectedFarmId),setSelectedFarmId=useViewStore(s=>s.setSelectedFarmId)
  const monthIndex=useViewStore(s=>s.monthIndex),setMonthIndex=useViewStore(s=>s.setMonthIndex)
  const layer=useViewStore(s=>s.layer),setLayer=useViewStore(s=>s.setLayer)
  const activeTab=useViewStore(s=>s.selectedTab),setActiveTab=useViewStore(s=>s.setSelectedTab)
  const latestAction=useViewStore(s=>s.latestAction),showAction=useViewStore(s=>s.showAction)
  const rainfallPct=useViewStore(s=>s.rainfallPct),setRainfallPct=useViewStore(s=>s.setRainfallPct)
  const tempDeltaC=useViewStore(s=>s.tempDeltaC),setTempDeltaC=useViewStore(s=>s.setTempDeltaC)
  const [editor,setEditor]=useState<{open:boolean;farm?:Farm}>({open:false})
  const [settings,setSettings]=useState(false)
  const [deleting,setDeleting]=useState(false)
  const [deletePassword,setDeletePassword]=useState('')
  const [accountError,setAccountError]=useState('')
  const [deleteFarm,setDeleteFarm]=useState<Farm|null>(null)
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [pickerOpen,setPickerOpen]=useState(false)
  const [inspector,setInspector]=useState<'overview'|'details'>('overview')
  const farm=useMemo(()=>farms.find(f=>f.id===selectedFarmId)||farms[0]||null,[farms,selectedFarmId])
  const declaredMissing=!!farm&&((layer==='ph'&&farm.soil.ph==null)||(layer==='materia_organica'&&farm.soil.organic_matter_percent==null)||(layer==='solo'&&farm.soil.texture==='unknown')||(layer==='irrigacao'&&farm.soil.irrigation==='unknown'))
  useEffect(()=>{if(farms.length&&!farms.find(f=>f.id===selectedFarmId))setSelectedFarmId(farms[0].id)},[farms,selectedFarmId,setSelectedFarmId])
  const newFarm=()=>setEditor({open:true})
  const editFarm=()=>farm&&setEditor({open:true,farm})
  const saved=(savedFarm:Farm)=>{queryClient.setQueryData<Farm[]>(['farms'],prev=>[savedFarm,...(prev||[]).filter(f=>f.id!==savedFarm.id)]);setSelectedFarmId(savedFarm.id);setEditor({open:false});showAction(`Propriedade “${savedFarm.name}” salva com sucesso`)}
  const handleDelete=async()=>{if(!deleteFarm)return;setDeleting(true);try{await farmApi.remove(deleteFarm.id);queryClient.setQueryData<Farm[]>(['farms'],prev=>(prev||[]).filter(f=>f.id!==deleteFarm.id));if(selectedFarmId===deleteFarm.id)setSelectedFarmId(null);showAction('Propriedade removida');setDeleteFarm(null)}catch(e){showAction(e instanceof ApiError?e.message:'Erro ao remover propriedade')}finally{setDeleting(false)}}
  const changeCrop=async(crop:string)=>{if(!farm)return;const {id,area_ha,centroid,created_at,updated_at,...payload}=farm;await farmApi.update(id,{...payload,crop});await queryClient.invalidateQueries({queryKey:['farms']})}
  const exportData=async()=>{try{const json=await api<Record<string,unknown>>('/privacy/export');const b=new Blob([JSON.stringify(json,null,2)],{type:'application/json'});const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download='terraturn-meus-dados.json';a.click();URL.revokeObjectURL(url);showAction('Exportação dos seus dados concluída')}catch{showAction('Falha na exportação dos dados')}}
  const deleteAccount=async()=>{if(!user)return;setAccountError('');try{await api<void>('/privacy/account',{method:'DELETE',body:JSON.stringify({email:user.email,password:deletePassword})});queryClient.clear();navigate('/login');location.reload()}catch(e){setAccountError(e instanceof ApiError?e.message:'Não foi possível excluir a conta')}}
  const signOut=async()=>{await logout();queryClient.clear();navigate('/login')}
  const selectFarm=(id:string)=>{setViewMode('3d');setSelectedFarmId(id);setPickerOpen(false);setSidebarOpen(false);setMonthIndex(new Date().getMonth());showAction('Propriedade selecionada')}
  return <div className="dashboard">
    <header className="topbar"><div className="topbar-brand"><button className="icon-btn mobile-menu" aria-label="Abrir menu" onClick={()=>setSidebarOpen(true)}><Menu size={20}/></button><Brand/><span className="topbar-divider"/><span className="topbar-product">{t('CENTRAL DE ANÁLISE')}</span></div>
      <div className="topbar-actions"><LanguagePicker/><span className="top-status"><span/> {t('MODO PREPARAÇÃO')}</span><button type="button" className="icon-btn" title="Configurações" onClick={()=>setSettings(true)}><Settings2 size={19}/></button><button type="button" className="user-button" onClick={()=>setSettings(true)} title="Conta e privacidade"><span>{user?.name?.slice(0,1)?.toUpperCase()||'U'}</span><div><strong>{user?.name?.split(' ')[0]}</strong><small>{t('Minha conta')}</small></div><ChevronDown size={15}/></button></div>
    </header>
    <div className="dashboard-layout">
      {sidebarOpen&&<button className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={`left-sidebar ${sidebarOpen?'open':''}`}>
        <div className="sidebar-head"><span className="eyebrow">{t('SEU ESPAÇO RURAL')}</span><button className="icon-btn mobile-menu" aria-label="Fechar menu" onClick={()=>setSidebarOpen(false)}><X size={18}/></button></div>
        <button className="farm-switch" onClick={()=>setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen}><span className="switch-icon"><MapPin size={19}/></span><span><small>{t('PROPRIEDADE ATIVA')}</small><strong>{farm?.name||'Nenhuma propriedade'}</strong></span><ChevronDown size={16}/></button>
        {pickerOpen&&<div className="farm-dropdown">{farms.map(f=><button type="button" key={f.id} className={f.id===farm?.id?'selected':''} onClick={()=>selectFarm(f.id)}>{f.name}{f.id===farm?.id&&<Check size={15}/>}</button>)}<button type="button" className="text-action" onClick={newFarm}><Plus size={14}/> {t('Nova propriedade')}</button></div>}
        <div className="sidebar-section-label"><span>{t('SUAS PROPRIEDADES')}</span><span>{farms.length}</span></div>
        <div className="farm-list">{farms.length?farms.map(f=><button type="button" key={f.id} className={`farm-list-item ${f.id===farm?.id?'active':''}`} onClick={()=>selectFarm(f.id)}><span className="farm-mini-icon"><Leaf size={16}/></span><span><strong>{f.name}</strong><small>{f.municipality||'Localidade não informada'} · {formatHa(f.area_ha)}</small></span>{f.id===farm?.id&&<span className="farm-active-dot"/>}</button>):<p className="sidebar-empty">{t('Nenhuma propriedade cadastrada ainda.')}</p>}</div>
        <button className="sidebar-new" onClick={newFarm}><Plus size={18}/> {t('Nova propriedade')} <ArrowRight size={16}/></button>
        <div className="sidebar-bottom"><div className="sidebar-bottom-link"><ShieldCheck size={14}/> {t('Sua área de trabalho é privada')}</div></div>
      </aside>
      <main className="center-workspace">
        <div className="workspace-heading"><div><span className="eyebrow">{t('PAINEL DE CONTROLE / VISÃO GERAL')}</span><h1 className={farm?'farm-display-name':undefined}>{farm?farm.name:t('Vamos começar pela sua terra.')}</h1><p className={farm?'farm-display-location':undefined}>{farm?`${farm.municipality||'Município não informado'}${farm.state?` · ${farm.state}`:''} · ${farm.country}`:t('Cadastre sua primeira propriedade para explorar o terreno em 3D.')}</p></div><div className="heading-actions">{farm&&<><button className="btn btn-outline btn-small" onClick={editFarm}><Edit3 size={15}/> Editar</button><button className="btn btn-icon-outline" title="Excluir propriedade" onClick={()=>setDeleteFarm(farm)}><Trash2 size={16}/></button></>}<button className="btn btn-primary btn-small" onClick={newFarm}><Plus size={15}/> {t('Nova propriedade')}</button></div></div>
        {!farm && <div className="empty-home"><div className="empty-orbit"/><span className="eyebrow">{t('SEU PRIMEIRO PASSO')}</span><h2>{t('Transforme uma área em possibilidades.')}</h2><p>{t('Comece traçando sua área de cultivo no mapa. Depois você poderá acompanhar o terreno, organizar seu calendário e preparar análises com dados da NASA.')}</p><button className="btn btn-primary" onClick={newFarm}>{t('Cadastrar propriedade')} <ArrowRight size={17}/></button></div>}
        {farm && <>
          <div className="stats-grid"><div className="mini-stat"><div><span>{t('ÁREA DE CULTIVO')}</span><Ruler size={17}/></div><strong>{formatHa(farm.area_ha)}</strong><small>{t('Calculada pelo contorno')}</small></div><div className="mini-stat"><div><span>{t('CULTURA PRINCIPAL')}</span><Sprout size={17}/></div><strong>{farm.crop}</strong><small>{t('Informada no cadastro')}</small></div><div className="mini-stat"><div><span>{t('TEXTURA DO SOLO')}</span><Layers3 size={17}/></div><strong>{textureNames[farm.soil.texture]}</strong><small>{t('Informação declarada')}</small></div><div className="mini-stat"><div><span>{t('DADOS CLIMÁTICOS')}</span><Cloud size={17}/></div><strong className="pending-title">{t('Aguardando')}</strong><small>{t('Integração NASA pendente')}</small></div></div>
          <section className="model-card"><div className="model-toolbar"><div><span className="eyebrow">{t('GÊMEO DIGITAL · ÁREA SELECIONADA')}</span><h2>{t('Visão do terreno')} <span className="model-crop-chip">{farm.crop}</span></h2></div><div className="model-actions"><span className="model-chip"><span className="live-indicator"/> {t('SIMULAÇÃO VISUAL')}</span><button className="btn btn-outline btn-small" onClick={editFarm}><Edit3 size={14}/> {t('Ajustar terreno')}</button></div></div>
            <div className="model-viewbar" aria-label={t('VISUALIZAÇÃO')}>
              <div className="view-modes">{([
                ['map','Mapa'],['relief','Mapa com relevo'],['satellite','Satélite'],['3d','3D'],['hybrid','3D + mapa']
              ] as [ViewMode,string][]).map(([mode,name])=><button key={mode} type="button" aria-pressed={viewMode===mode} className={viewMode===mode?'active':''} onClick={()=>setViewMode(mode)}>{t(name)}</button>)}</div>
              <button type="button" className="marker-toggle" aria-pressed={showMarkers} onClick={()=>setShowMarkers(v=>!v)}><MapPin size={15}/>{t(showMarkers?'Ocultar marcadores':'Exibir marcadores')}</button>
            </div>
            <div className="model-canvas">
              {viewMode==='3d'?<TerrainPlot key={farm.id} farm={farm} monthIndex={monthIndex} layer={layer} onInspect={()=>{setInspector('details');showAction('Área de cultivo selecionada')}}/>:
               viewMode==='hybrid'?<><TerrainMapView key={farm.id+'hybrid'} farm={farm} mode="hybrid"/><div className="hybrid-3d-overlay"><TerrainPlot key={farm.id+'model'} farm={farm} monthIndex={monthIndex} layer={layer} transparent/></div></>:
               <TerrainMapView key={farm.id+'map'} farm={farm} mode={viewMode}/>}
              {showMarkers&&<div className="land-markers" aria-label="Indicadores da área">
                <button className="floating-marker marker-crop" type="button" onClick={()=>setInspector('details')}><Sprout size={16}/><span><small>{t('CULTURA PRINCIPAL')} · cadastro</small><strong>{farm.crop}</strong></span></button>
                <button className="floating-marker marker-soil" type="button" onClick={()=>{setLayer('solo');setInspector('details')}}><Layers3 size={16}/><span><small>{t('TEXTURA DO SOLO')} · cadastro</small><strong>{textureNames[farm.soil.texture]}</strong></span></button>
                <button className="floating-marker marker-climate" type="button" onClick={()=>setLayer('chuva')}><CloudRain size={16}/><span><small>CLIMA · NASA</small><strong>Dados pendentes</strong></span></button>
              </div>}<div className="model-legend"><span className="eyebrow">{t('CAMADA ATIVA')}</span><strong>{t(getLayer(layer).label)}</strong><small>{getLayer(layer).description}</small><small className="legend-source">{declaredMissing?'Não informado':getLayer(layer).status==='declared'?t('Dado declarado'):getLayer(layer).status==='pending'?t('Não conectado'):t('Ilustrativo')} · {getLayer(layer).source}</small><span className="legend-dot-line"><i/> Apenas representação gráfica</span></div><div className="model-date"><CalendarClock size={16}/><div><small>{t('PERÍODO SELECIONADO')}</small><strong>{monthName(monthIndex)} {new Date().getFullYear()}</strong></div></div></div>
            <div className="model-footer"><p><ShieldCheck size={15}/> {viewMode==='hybrid'?'Composição visual de modelo 3D e mapa. O modelo não está alinhado a um DEM georreferenciado.':viewMode==='3d'?'Malha fiel ao polígono cadastrado; relevo e plantas são modelos estilizados, não medições de satélite.':viewMode==='satellite'?'Imagem orbital NASA GIBS de resolução regional; não substitui imagens detalhadas do talhão.':'O perímetro corresponde à propriedade cadastrada. Confira a resolução e a fonte da camada geográfica.'}</p><button className="text-action" onClick={()=>setActiveTab('timeline')}>{t('Explorar timeline')} <ArrowRight size={15}/></button></div>
          </section>
          <div className="bottom-card"><div className="bottom-tabs"><button className={activeTab==='timeline'?'active':''} onClick={()=>setActiveTab('timeline')}><CalendarClock size={17}/> Linha do tempo</button><button className={activeTab==='assistant'?'active':''} onClick={()=>setActiveTab('assistant')}><Sparkles size={17}/> Assistente agrícola <span className="tiny-dot"/></button></div>{activeTab==='timeline'?<Timeline farm={farm}/>:<Assistant key={farm.id} farm={farm} onEdit={editFarm} onNew={newFarm} onChangeCrop={changeCrop}/>}</div>
          <div className="responsible-note"><ShieldCheck size={15}/><span>{t('TerraTurn é uma ferramenta de apoio ao planejamento. Recomendações futuras deverão ser validadas por profissionais habilitados.')}</span></div>
        </>}
      </main>
      <aside className="right-inspector"><div className="inspector-heading"><span className="eyebrow">{t('CENTRAL DE ANÁLISE')}</span><h2>{t('Inspetor')} <Settings2 size={18}/></h2><p>{t('Explore suas camadas e informações técnicas.')}</p></div>
        <div className="inspector-tabs"><button className={inspector==='overview'?'active':''} onClick={()=>setInspector('overview')}>{t('Camadas')}</button><button className={inspector==='details'?'active':''} onClick={()=>setInspector('details')}>{t('Dados técnicos')}</button></div>
        {inspector==='overview'?<><div className="inspector-section-label">{t('Camadas agronômicas')}</div><div className="layer-list">{(['Cultivo','Solo','Relevo','Clima','Manejo'] as const).map(group=><div className="layer-group" key={group}><div className="layer-group-heading">{t(group)}</div>{LAYERS.filter(l=>l.group===group).map(l=><button type="button" key={l.value} className={`layer-item ${layer===l.value?'active':''}`} title={l.description} onClick={()=>{setLayer(l.value);showAction(`Camada ${l.label} selecionada`)}}><span className="layer-icon"><l.icon size={17}/></span><span><strong>{t(l.label)}</strong><small>{l.source} · {l.status==='pending'?'Pendente':l.status==='declared'?'Declarado':'Ilustrativo'}</small></span><span className="layer-radio"/></button>)}</div>)}</div><div className="inspector-section-label">{t('DISPONIBILIDADE DOS DADOS')}</div><div className="source-status"><div><span className="source-status-dot inactive"/><strong>NASA POWER</strong><small>Pendente</small></div><div><span className="source-status-dot inactive"/><strong>GEOS-FP</strong><small>Pendente</small></div><div><span className="source-status-dot inactive"/><strong>SMAP / GPM</strong><small>Pendente</small></div><div><span className="source-status-dot ready"/><strong>Polígono cadastrado</strong><small>Ativo</small></div></div><div className="scenario-tools"><div className="inspector-section-label">{t('CENÁRIO HIPOTÉTICO')}</div><label>{t('Variação de chuva')} <strong>{rainfallPct>0?'+':''}{rainfallPct}%</strong><input type="range" min="-40" max="40" step="5" value={rainfallPct} onChange={e=>setRainfallPct(Number(e.target.value))}/></label><label>{t('Temperatura')} <strong>{tempDeltaC>0?'+':''}{tempDeltaC} °C</strong><input type="range" min="-3" max="3" step="0.5" value={tempDeltaC} onChange={e=>setTempDeltaC(Number(e.target.value))}/></label><p>Controles preparados para o motor de cenários. Ainda não alteram indicadores científicos nem geram previsões.</p><button className="text-action" type="button" onClick={()=>{setRainfallPct(0);setTempDeltaC(0)}}><RefreshCw size={14}/> Restaurar hipóteses</button></div></>:<div className="technical-details"><div className="inspector-section-label">{t('INFORMAÇÕES DA ÁREA')}</div>{farm?<><dl><div><dt>Latitude central</dt><dd>{formatCoord(farm.centroid[1])}°</dd></div><div><dt>Longitude central</dt><dd>{formatCoord(farm.centroid[0])}°</dd></div><div><dt>Área (geodésica)</dt><dd>{formatHa(farm.area_ha)}</dd></div><div><dt>Vértices da malha</dt><dd>{farm.geometry.coordinates[0].length-1}</dd></div><div><dt>pH</dt><dd>{farm.soil.ph??'Sem análise'}</dd></div><div><dt>Matéria orgânica</dt><dd>{farm.soil.organic_matter_percent!==null?`${farm.soil.organic_matter_percent}%`:'Sem análise'}</dd></div><div><dt>Irrigação</dt><dd>{irrigationNames[farm.soil.irrigation]}</dd></div><div><dt>Cultura anterior</dt><dd>{farm.previous_crop||'Não informada'}</dd></div><div><dt>Plantio previsto</dt><dd>{farm.planting_month?monthName(farm.planting_month-1):'Não informado'}</dd></div></dl><button className="btn btn-outline btn-wide" onClick={editFarm}>{t('Editar dados da propriedade')} <Edit3 size={15}/></button></>:<p>Selecione uma propriedade.</p>}</div>}
        <div className="inspector-footer"><div className="coming-data"><Activity size={17}/><strong>{t('Estudos científicos')}</strong><p>Os módulos da equipe de IA utilizarão dados climáticos e do solo quando integrados.</p><span>INTEGRAÇÃO PENDENTE</span></div></div>
      </aside>
    </div>
    {latestAction&&<div className="action-toast" role="status"><Check size={17}/><span>{latestAction}</span><button onClick={()=>showAction('')} aria-label="Dispensar aviso"><X size={16}/></button></div>}
    {editor.open&&<FarmForm farm={editor.farm} draftKey={user?.id??'anonymous'} onClose={()=>setEditor({open:false})} onSaved={saved}/>}
    {deleteFarm&&<div className="modal-overlay" role="dialog" aria-modal="true"><div className="confirm-modal"><span className="confirm-icon"><Trash2 size={22}/></span><h2>Remover propriedade?</h2><p>A propriedade <strong>{deleteFarm.name}</strong> será removida permanentemente. Não é possível desfazer esta ação.</p><div className="confirm-actions"><button className="btn btn-outline" onClick={()=>setDeleteFarm(null)}>Cancelar</button><button className="btn btn-destructive" onClick={handleDelete} disabled={deleting}>{deleting?'Removendo...':'Excluir propriedade'}</button></div></div></div>}
    {settings&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="account-title"><div className="account-modal"><div className="account-head"><div><span className="eyebrow">CONTA E PRIVACIDADE</span><h2 id="account-title">{t('Minha conta')}</h2></div><button className="icon-btn" onClick={()=>setSettings(false)} aria-label="Fechar"><X/></button></div><div className="account-user"><span className="account-avatar"><UserRound/></span><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div><div className="account-actions"><button onClick={exportData}><ArrowDownToLine size={18}/><span><strong>{t('Exportar meus dados')}</strong><small>{t('Baixar informações cadastradas em JSON')}</small></span><ArrowRight size={17}/></button><button onClick={signOut}><LogOut size={18}/><span><strong>{t('Sair da conta')}</strong><small>{t('Encerrar sessão neste navegador')}</small></span><ArrowRight size={17}/></button></div><div className="account-danger"><h3>{t('Excluir minha conta')}</h3><p>{t('Esta operação elimina os dados cadastrados da aplicação. Confirme sua senha para continuar.')}</p><label>{t('Confirme sua senha')}<input type="password" value={deletePassword} onChange={e=>setDeletePassword(e.target.value)} autoComplete="current-password" placeholder="Senha atual"/></label>{accountError&&<p className="form-error">{accountError}</p>}<button disabled={!deletePassword} className="btn btn-destructive btn-small" onClick={deleteAccount}>{t('Excluir conta e propriedades')}</button></div></div></div>}
  </div>
}
