const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const PUBLIC_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

async function loadLot(id){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||PUBLIC_KEY;
  const url=`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(id)}&select=id,lot_number,title,image_url,current_bid,valuation,min_increment`;
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

  const lotNumber=esc(lot?.lot_number??q.number??'');
  const name=esc(lot?.title||q.name||'Lote em leilão');
  const current=esc(lot?money(lot.current_bid):(q.current||''));
  const valuation=esc(lot?money(lot.valuation):(q.valuation||''));
  const step=esc(lot?money(lot.min_increment):(q.step||''));
  const rawImage=String(lot?.image_url||q.image||'');

  const origin=`https://${req.headers.host}`;
  const target=`${origin}/?lote=${encodeURIComponent(lotId)}`;
  const version=encodeURIComponent(String(q.v||'2'));
  const canonical=`${origin}/api/share?l=${encodeURIComponent(lotId)}&v=${version}`;

  let image='https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80';
  try{
    const parsed=new URL(rawImage);
    if(parsed.protocol==='https:'&&parsed.hostname==='dsgnyfnddyxilakjwavu.supabase.co'&&parsed.pathname.startsWith('/storage/v1/object/public/lot-images/')){
      image=parsed.toString();
    }
  }catch{}

  const title=lotNumber?`Lote #${lotNumber} - ${name}`:`Leilão ao vivo: ${name}`;
  const details=[];
  if(current)details.push(`Lance atual ${current}`);
  if(valuation)details.push(`Avaliação ${valuation}`);
  if(step)details.push(`Incremento ${step}`);
  const desc=details.length?details.join(' • '):'Veja a foto, acompanhe o lote e participe do leilão.';

  const safeImage=esc(image);
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><meta property="og:type" content="website"><meta property="og:site_name" content="LanceCerto"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${safeImage}"><meta property="og:image:secure_url" content="${safeImage}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Foto do lote"><meta property="og:url" content="${esc(canonical)}"><link rel="image_src" href="${safeImage}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${safeImage}"></head><body><p>Abrindo lote...</p><p><a href="${esc(target)}">Clique aqui se o lote não abrir automaticamente.</a></p><script>location.replace(${JSON.stringify(target)})<\/script></body></html>`);
};