import { create } from 'zustand'

export interface Session { id:string; name:string; phone:string|null; status:string }
export interface Group { id:number; group_jid:string; group_name:string; participant_count:number; is_admin:number; session_id:string; session_name:string; session_phone:string }
export interface Job { id:string; name:string; status:string; total_groups:number; sent_count:number; failed_count:number; scheduled_at:string|null; created_at:string }

interface Store {
  sessions: Session[]; groups: Group[]; jobs: Job[]
  selectedGroups: Set<string>; page: 'sessions'|'compose'|'jobs'
  setSessions:(s:Session[])=>void; setGroups:(g:Group[])=>void; setJobs:(j:Job[])=>void
  updateSession:(id:string,d:Partial<Session>)=>void; updateJob:(id:string,d:Partial<Job>)=>void
  addJob:(j:Job)=>void; toggleGroup:(jid:string)=>void
  selectAll:()=>void; clearSelection:()=>void; setPage:(p:any)=>void
}

export const useStore = create<Store>((set,get) => ({
  sessions:[], groups:[], jobs:[], selectedGroups: new Set(), page:'sessions',
  setSessions: sessions => set({sessions}),
  setGroups:   groups   => set({groups}),
  setJobs:     jobs     => set({jobs}),
  updateSession: (id,d) => set(s=>({sessions:s.sessions.map(x=>x.id===id?{...x,...d}:x)})),
  updateJob:     (id,d) => set(s=>({jobs:s.jobs.map(x=>x.id===id?{...x,...d}:x)})),
  addJob: j => set(s=>({jobs:[j,...s.jobs]})),
  toggleGroup: jid => set(s=>{ const n=new Set(s.selectedGroups); n.has(jid)?n.delete(jid):n.add(jid); return {selectedGroups:n} }),
  selectAll:     () => set(s=>({selectedGroups:new Set(s.groups.map(g=>g.group_jid))})),
  clearSelection:() => set({selectedGroups:new Set()}),
  setPage: page => set({page}),
}))
