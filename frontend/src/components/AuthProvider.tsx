import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { sessionApi } from '../lib/api'
import type { User } from '../types'

type AuthContextType = { user: User|null; ready:boolean; setUser:(user:User|null)=>void; logout:()=>Promise<void> }
const AuthContext = createContext<AuthContextType|null>(null)
export function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser] = useState<User|null>(null)
  const [ready,setReady] = useState(false)
  useEffect(() => { let active=true; sessionApi.me().then(u=>{if(active)setUser(u)}).catch(()=>{}).finally(()=>{if(active)setReady(true)}); return()=>{active=false} },[])
  const logout = async () => { try { await sessionApi.logout() } finally { setUser(null) } }
  return <AuthContext.Provider value={{user,ready,setUser,logout}}>{children}</AuthContext.Provider>
}
export const useAuth = () => {const value=useContext(AuthContext);if(!value)throw Error('Missing AuthProvider');return value}
