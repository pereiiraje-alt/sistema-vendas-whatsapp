const ALLOWED_HOST='dsgnyfnddyxilakjwavu.supabase.co';
const ALLOWED_PREFIX='/storage/v1/object/public/lot-images/';

module.exports=async(req,res)=>{
  try{
    const src=String(req.query?.src||'');
    if(!src)return res.status(400).send('Imagem não informada.');

    let url;
    try{url=new URL(src)}catch{return res.status(400).send('URL de imagem inválida.');}

    if(url.protocol!=='https:'||url.hostname!==ALLOWED_HOST||!url.pathname.startsWith(ALLOWED_PREFIX)){
      return res.status(403).send('Imagem não permitida.');
    }

    const upstream=await fetch(url.toString(),{
      headers:{'User-Agent':'LanceCerto-SharePreview/1.0'}
    });
    if(!upstream.ok)return res.status(502).send('Não foi possível carregar a imagem.');

    const type=upstream.headers.get('content-type')||'image/jpeg';
    const buffer=Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Content-Type',type);
    res.setHeader('Content-Length',String(buffer.length));
    res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin','*');
    return res.status(200).send(buffer);
  }catch(error){
    console.error('share-image',error);
    return res.status(500).send('Erro ao carregar imagem.');
  }
};