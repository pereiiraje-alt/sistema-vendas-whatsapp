const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
const PUBLIC_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';

async function loadImageUrl(id){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||PUBLIC_KEY;
  const url=`${SUPABASE_URL}/rest/v1/lots?id=eq.${encodeURIComponent(id)}&select=image_url`;
  const headers={apikey:key};
  if(String(key).split('.').length===3)headers.Authorization=`Bearer ${key}`;
  const r=await fetch(url,{headers});
  if(!r.ok)throw new Error('Não foi possível carregar a imagem.');
  const rows=await r.json();
  return String(rows?.[0]?.image_url||'');
}

module.exports=async(req,res)=>{
  try{
    const lotId=String(req.query?.l||req.query?.lot||req.query?.id||'');
    if(!lotId)return res.status(400).send('Lote não informado.');
    const raw=await loadImageUrl(lotId);
    const parsed=new URL(raw);
    const allowed=parsed.protocol==='https:'&&parsed.hostname==='dsgnyfnddyxilakjwavu.supabase.co'&&parsed.pathname.startsWith('/storage/v1/object/public/lot-images/');
    if(!allowed)return res.status(404).send('Imagem não disponível.');
    const upstream=await fetch(parsed.toString(),{headers:{'User-Agent':'JP-Leiloes-Share-Preview/1.0'}});
    if(!upstream.ok)return res.status(404).send('Imagem não disponível.');
    const type=upstream.headers.get('content-type')||'image/jpeg';
    const bytes=Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type',type);
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('Cache-Control','public, max-age=300, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.status(200).end(bytes);
  }catch(error){
    console.error('share image',error);
    res.status(404).send('Imagem não disponível.');
  }
};