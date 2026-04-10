import axios from 'axios'
const api = axios.create({ baseURL: '' })

export const getSessions    = () => api.get('/api/sessions').then(r=>r.data)
export const createSession  = (name:string) => api.post('/api/sessions',{name}).then(r=>r.data)
export const deleteSession  = (id:string) => api.delete(`/api/sessions/${id}`)
export const connectQR      = (id:string) => api.post(`/api/sessions/${id}/connect/qr`)
export const connectPairing = (id:string, phoneNumber:string) =>
  api.post(`/api/sessions/${id}/connect/pairing`,{phoneNumber}).then(r=>r.data)
export const syncGroups     = (id:string) => api.post(`/api/sessions/${id}/groups/sync`)
export const getAllGroups    = () => api.get('/api/groups').then(r=>r.data)
export const getJobs        = () => api.get('/api/jobs').then(r=>r.data)
export const getJobLogs     = (id:string) => api.get(`/api/jobs/${id}/logs`).then(r=>r.data)
export const deleteJob      = (id:string) => api.delete(`/api/jobs/${id}`)

export async function createJob(p:{name?:string;groupJids:string[];message:string;scheduledAt?:string;media?:File}) {
  const fd = new FormData()
  fd.append('groupJids', JSON.stringify(p.groupJids))
  fd.append('message', p.message)
  if (p.name) fd.append('name', p.name)
  if (p.scheduledAt) fd.append('scheduledAt', p.scheduledAt)
  if (p.media) fd.append('media', p.media)
  return api.post('/api/jobs', fd).then(r=>r.data)
}
