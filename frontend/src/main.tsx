import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './components/AuthProvider'
import { AuthPage } from './pages/AuthPages'
import Privacy from './pages/Privacy'
import Dashboard from './pages/Dashboard'
import './styles.css'

const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}})
function Private({children}:{children:React.ReactNode}) {
  const {user,ready}=useAuth()
  if(!ready)return <div className="loading-page">Loading TerraTurn…</div>
  if(!user)return <Navigate to="/login" replace/>
  return <>{children}</>
}
function Root(){return <BrowserRouter><AuthProvider><Routes>
  <Route path="/login" element={<AuthPage mode="login"/>}/>
  <Route path="/register" element={<AuthPage mode="register"/>}/>
  <Route path="/forgot-password" element={<AuthPage mode="forgot"/>}/>
  <Route path="/reset-password" element={<AuthPage mode="reset"/>}/>
  <Route path="/privacy" element={<Privacy/>}/>
  <Route path="/app" element={<Private><Dashboard/></Private>}/>
  <Route path="*" element={<Navigate to="/app" replace/>}/>
</Routes></AuthProvider></BrowserRouter>}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><Root/></QueryClientProvider></React.StrictMode>)
