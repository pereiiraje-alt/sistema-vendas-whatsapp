function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function decodeHtml(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")}

module.exports=async(req,res)=>{
  try{
    const lotId=String(req.query?.l||req.query?.lot||req.query?.id||'');
    if(!lotId)return res.status(400).send('Lote não informado.');

    const origin=`https://${req.headers.host}`;
    const source=`${origin}/api/share?l=${encodeURIComponent(lotId)}`;
    const response=await fetch(source,{headers:{'User-Agent':'LanceCerto-SharePreview/2.0'}});
    if(!response.ok)return res.status(response.status).send('Não foi possível gerar o compartilhamento.');

    let html=await response.text();
    const match=html.match(/<meta property="og:image" content="([^"]+)"/i);
    let image=decodeHtml(match?.[1]||'');

    try{
      const parsed=new URL(image);
      if(parsed.pathname==='/api/share-image'&&parsed.searchParams.get('src')){
        const direct=new URL(parsed.searchParams.get('src'));
        if(direct.protocol==='https:')image=direct.toString();
      }
    }catch{}

    if(image&&image.startsWith('https://')){
      const safe=esc(image);
      html=html
        .replace(/<meta property="og:image" content="[^"]*">/i,`<meta property="og:image" content="${safe}">`)
        .replace(/<meta property="og:image:secure_url" content="[^"]*">/i,`<meta property="og:image:secure_url" content="${safe}">`)
        .replace(/<meta name="twitter:image" content="[^"]*">/i,`<meta name="twitter:image" content="${safe}">`)
        .replace('</head>',`<meta property="og:image:alt" content="Foto do lote"><link rel="image_src" href="${safe}"></head>`);
    }

    const version=encodeURIComponent(String(req.query?.v||'1'));
    html=html.replace(/<meta property="og:url" content="[^"]*">/i,`<meta property="og:url" content="${esc(`${origin}/api/share-v2?l=${encodeURIComponent(lotId)}&v=${version}`)}">`);

    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');
    return res.status(200).send(html);
  }catch(error){
    console.error('share-v2',error);
    return res.status(500).send('Erro ao gerar compartilhamento.');
  }
};