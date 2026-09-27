const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const PUBLIC_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';

async function loadLot(id){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||PUBLIC_KEY;
  const url=`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(id)}&select=id,title,image_url,starting_bid,valuation,min_increment,starts_at,ends_at`;
  const headers={apikey:key};
  if(String(key).split('.').length===3)headers.Authorization=`Bearer ${key}`;
  const response=await fetch(url,{headers});
  if(!response.ok)throw new Error('Não foi possível carregar o lote.');
  const rows=await response.json();
  return rows?.[0]||null;
}

module.exports=async(req,res)=>{
  const q=req.query||{};
  const lotId=String(q.l||q.lot||q.id||'');
  if(!lotId)return res.status(400).send('Lote não informado.');

  let lot=null;
  try{lot=await loadLot(lotId)}catch(error){console.error('share lot',error)}

  const name=esc(lot?.title||'Leilão online');
  const valuation=esc(lot?money(lot.valuation):(q.valuation||''));
  const startBid=esc(lot?money(lot.starting_bid):(q.start||''));
  const step=esc(lot?money(lot.min_increment):(q.step||''));
  const starts=esc(lot?dateLabel(lot.starts_at):(q.starts||''));
  const ends=esc(lot?dateLabel(lot.ends_at):(q.ends||''));
  const rawImage=String(lot?.image_url||q.image||'');

  const origin=`https://${req.headers.host}`;
  const target=`${origin}/?lote=${encodeURIComponent(lotId)}`;
  const version=encodeURIComponent(String(q.v||'3'));
  const canonical=`${origin}/api/share?l=${encodeURIComponent(lotId)}&v=${version}`;

  let image='https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80';
  try{
    const parsed=new URL(rawImage);
    if(parsed.protocol==='https:'&&parsed.hostname==='dsgnyfnddyxilakjwavu.supabase.co'&&parsed.pathname.startsWith('/storage/v1/object/public/lot-images/')){
      image=parsed.toString();
    }
  }catch{}

  const title=name;
  const details=[];
  if(valuation)details.push(`Avaliação ${valuation}`);
  if(startBid)details.push(`Lance inicial ${startBid}`);
  if(step)details.push(`Acréscimo ${step}`);
  if(starts)details.push(`Começa ${starts}`);
  if(ends)details.push(`Termina ${ends}`);
  const desc=details.join(' • ');

  const safeImage=esc(image);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><meta property="og:type" content="website"><meta property="og:site_name" content="JP Leilões"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${safeImage}"><meta property="og:image:secure_url" content="${safeImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Foto do lote"><meta property="og:url" content="${esc(canonical)}"><link rel="image_src" href="${safeImage}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${safeImage}"></head><body><p>Abrindo lote...</p><p><a href="${esc(target)}">Clique aqui se o lote não abrir automaticamente.</a></p><script>location.replace(${JSON.stringify(target)})<\/script></body></html>`);
};