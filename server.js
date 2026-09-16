import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 8080;
const AMO_BASE_URL = (process.env.AMO_BASE_URL || '').replace(/\/$/, '');
const CLIENT_ID = process.env.AMO_CLIENT_ID;
const CLIENT_SECRET = process.env.AMO_CLIENT_SECRET;
const REDIRECT_URI = process.env.AMO_REDIRECT_URI;
const API_KEY = process.env.CONNECTOR_API_KEY;
let tokens = { access_token: process.env.AMO_ACCESS_TOKEN, refresh_token: process.env.AMO_REFRESH_TOKEN, expires_at: 0 };

function requireApiKey(req,res,next){
  if (!API_KEY) return res.status(503).json({error:'CONNECTOR_API_KEY is not configured'});
  const supplied=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const a=Buffer.from(supplied), b=Buffer.from(API_KEY);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'unauthorized'});
  next();
}
async function refresh(){
  if(!tokens.refresh_token) throw new Error('No refresh token. Authorize amoCRM first.');
  const r=await fetch(`${AMO_BASE_URL}/oauth2/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'refresh_token',refresh_token:tokens.refresh_token,redirect_uri:REDIRECT_URI})});
  if(!r.ok) throw new Error(`amoCRM refresh failed: ${r.status} ${await r.text()}`);
  const j=await r.json(); tokens={...j,expires_at:Date.now()+((j.expires_in||86400)-60)*1000}; return tokens;
}
async function accessToken(){ if(!tokens.access_token || (tokens.expires_at && Date.now()>tokens.expires_at)) await refresh(); return tokens.access_token; }
async function amo(path){
  let t=await accessToken(); let r=await fetch(`${AMO_BASE_URL}${path}`,{headers:{Authorization:`Bearer ${t}`}});
  if(r.status===401 && tokens.refresh_token){ await refresh(); t=tokens.access_token; r=await fetch(`${AMO_BASE_URL}${path}`,{headers:{Authorization:`Bearer ${t}`}}); }
  if(!r.ok) throw new Error(`amoCRM GET ${path}: ${r.status} ${await r.text()}`); return r.json();
}
async function all(path,key){ let page=1,out=[]; while(page<=50){ const sep=path.includes('?')?'&':'?'; const j=await amo(`${path}${sep}limit=250&page=${page}`); const rows=j?._embedded?.[key]||[]; out.push(...rows); if(rows.length<250) break; page++; } return out; }

app.get('/',(_,res)=>res.json({service:'Bulvar AI Connector',status:'ok',mode:'read-only'}));
app.get('/health',(_,res)=>res.json({ok:true}));
app.get('/oauth/callback',async(req,res)=>{
  try{ const code=req.query.code; if(!code) return res.status(400).send('Missing OAuth code');
    const r=await fetch(`${AMO_BASE_URL}/oauth2/access_token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:REDIRECT_URI})});
    if(!r.ok) throw new Error(await r.text()); const j=await r.json(); tokens={...j,expires_at:Date.now()+((j.expires_in||86400)-60)*1000};
    res.send('amoCRM connected. Keep this Railway service private and configure persistent token storage before production use.');
  }catch(e){res.status(500).send(String(e.message||e));}
});

app.use('/api',requireApiKey);
app.get('/api/account',async(_,res)=>{try{res.json(await amo('/api/v4/account?with=amojo_id,users_groups,task_types'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/users',async(_,res)=>{try{res.json(await all('/api/v4/users','users'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/pipelines',async(_,res)=>{try{res.json(await all('/api/v4/leads/pipelines','pipelines'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/tasks',async(_,res)=>{try{res.json(await all('/api/v4/tasks','tasks'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/leads',async(_,res)=>{try{res.json(await all('/api/v4/leads?with=contacts','leads'));}catch(e){res.status(500).json({error:e.message});}});
app.get('/api/analysis',async(_,res)=>{try{
  const [leads,tasks]=await Promise.all([all('/api/v4/leads?with=contacts','leads'),all('/api/v4/tasks','tasks')]);
  const now=Math.floor(Date.now()/1000); const openTasks=tasks.filter(t=>!t.is_completed); const leadTaskIds=new Set(openTasks.filter(t=>t.entity_type==='leads').map(t=>Number(t.entity_id)));
  const activeLeads=leads.filter(l=>!l.is_deleted && ![142,143].includes(Number(l.status_id)));
  res.json({generated_at:new Date().toISOString(),counts:{leads:leads.length,active_leads:activeLeads.length,open_tasks:openTasks.length,overdue_tasks:openTasks.filter(t=>t.complete_till<now).length,active_leads_without_open_task:activeLeads.filter(l=>!leadTaskIds.has(Number(l.id))).length},overdue_tasks:openTasks.filter(t=>t.complete_till<now),active_leads_without_open_task:activeLeads.filter(l=>!leadTaskIds.has(Number(l.id))});}
}catch(e){res.status(500).json({error:e.message});}});
app.listen(PORT,'0.0.0.0',()=>console.log(`Bulvar AI Connector listening on ${PORT}`));
