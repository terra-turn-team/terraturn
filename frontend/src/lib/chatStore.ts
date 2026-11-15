import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ChatItem } from '../types'

// Conversa com a IA guardada por fazenda: sobrevive a fechar o chat e a recarregar a página.
const MAX_PER_FARM = 60

type ChatState = {
  byFarm: Record<string, ChatItem[]>
  add: (farmId: string, item: ChatItem) => void
  clear: (farmId: string) => void
}

export const useChatStore = create<ChatState>()(persist((set) => ({
  byFarm: {},
  add: (farmId, item) => set(s => ({ byFarm: { ...s.byFarm, [farmId]: [...(s.byFarm[farmId] ?? []), item].slice(-MAX_PER_FARM) } })),
  clear: (farmId) => set(s => { const { [farmId]: _removed, ...rest } = s.byFarm; return { byFarm: rest } }),
}), {
  name: 'terraturn-chat-v1',
  storage: createJSONStorage(() => {
    try { localStorage.setItem('terraturn-chat-test', '1'); localStorage.removeItem('terraturn-chat-test'); return localStorage }
    catch { const mem = new Map<string, string>(); return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v) }, removeItem: k => { mem.delete(k) } } }
  }),
}))
