const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports=(req,res)=>{
  const q=req.query||{};
  const lotId=String(q.lot||q.id||'');
  const lotNumber=esc(q.number||'');
  const name=esc(q.name||'Lote em leilão');
  const current=esc(q.current||'');
  const valuation=esc(q.valuation||'');
  const step=esc(q.step||'');
  let image=String(q.image||'');

  if(!/^https:\/\//i.test(image)){
    image='https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80';
  }

  const origin=`https://${req.headers.host}`;
  const target=`${origin}/?lote=${encodeURIComponent(lotId)}`;
  const title=lotNumber?`Lote #${lotNumber} - ${name}`:`Leilão ao vivo: ${name}`;
  const details=[];
  if(current)details.push(`Lance atual ${current}`);
  if(valuation)details.push(`Avaliação ${valuation}`);
  if(step)details.push(`Incremento ${step}`);
  const desc=details.length?details.join(' • '):'Veja a foto, acompanhe o lote e participe do leilão.';

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${desc}"><meta property="og:type" content="website"><meta property="og:site_name" content="LanceCerto"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${esc(target)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${desc}"><meta name="twitter:image" content="${esc(image)}"><meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><p>Abrindo lote...</p><script>location.replace(${JSON.stringify(target)})<\/script></body></html>`);
};