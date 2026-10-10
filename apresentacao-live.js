(()=>{
  const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';
  const SUPABASE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const locationText=a=>[a.city,a.state].filter(Boolean).join(' - ');
  const graceMs=5*60*1000;

  function loadSupabase(){
    if(window.supabase)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-jp-supabase]');
      if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.dataset.jpSupabase='1';
      s.onload=resolve;
      s.onerror=()=>reject(new Error('Não foi possível carregar a conexão.'));
      document.head.appendChild(s);
    });
  }

  function emptyCard(message){
    return `<div style="grid-column:1/-1;background:#fff;border:1px solid #e5ece8;border-radius:18px;padding:30px;text-align:center;color:#66766e"><b style="display:block;color:#102019;font-size:18px;margin-bottom:6px">${esc(message)}</b><span>Assim que houver um venda por lances ativo, ele aparecerá aqui automaticamente.</span></div>`;
  }

  async function boot(){
    const grid=document.querySelector('#leiloes .auctionGrid');
    if(!grid)return;
    grid.innerHTML=emptyCard('Carregando vendas por lances atuais...');
    try{
      await loadSupabase();
      if(!window.supabase)throw new Error('Conexão indisponível.');
      const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      const {data:auctions,error}=await db.rpc('public_live_auctions');
      if(error)throw error;
      const now=Date.now();
      const visible=(auctions||[]).filter(a=>!a.ends_at||new Date(a.ends_at).getTime()+graceMs>now);
      if(!visible.length){grid.innerHTML=emptyCard('Nenhum venda por lances ao vivo neste momento.');return;}

      const ids=visible.map(a=>a.id);
      const {data:lots,error:lotsError}=await db.from('lots')
        .select('id,auction_id,title,image_url,valuation,current_bid,starting_bid,ends_at,status,lot_number')
        .in('auction_id',ids)
        .order('lot_number',{ascending:true});
      if(lotsError)throw lotsError;

      const firstLot=new Map();
      (lots||[]).forEach(l=>{if(!firstLot.has(String(l.auction_id)))firstLot.set(String(l.auction_id),l)});
      grid.innerHTML=visible.slice(0,3).map(a=>{
        const lot=firstLot.get(String(a.id));
        const ended=!!(a.ends_at&&new Date(a.ends_at).getTime()<=Date.now());
        const loc=locationText(a)||a.location||'';
        const company=a.company_name||'Empresa parceira';
        const title=a.title||lot?.title||'Venda por lances ao vivo';
        const href=lot?.id?`/?lote=${encodeURIComponent(lot.id)}`:'explorar.html';
        const photo=lot?.image_url
          ? `<img src="${esc(lot.image_url)}" alt="${esc(lot.title||title)}" style="width:100%;height:100%;object-fit:cover">`
          : '🔨';
        const value=lot?money(lot.current_bid||lot.starting_bid):'Consulte os lotes';
        const endText=a.ends_at?new Date(a.ends_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Em andamento';
        return `<article class="auction">
          <div class="auctionPic">${photo}<div class="badges"><span class="badge">${ended?'● ENCERRADO':'● AO VIVO'}</span></div></div>
          <div class="auctionBody">
            <div class="seller">${esc(company)}${loc?` · ${esc(loc)}`:''}</div>
            <h3>${esc(title)}</h3>
            <div class="meta">${lot?'<span>▣ Lotes disponíveis</span>':''}${loc?`<span>📍 ${esc(loc)}</span>`:''}</div>
            <div class="auctionBottom"><div class="auctionPrice"><small>${lot?'Lance atual':'Status'}</small><b>${esc(value)}</b></div><div class="ends"><small>${ended?'Encerrado em':'Termina em'}</small><div class="timer"><span style="min-width:118px"><b>${esc(endText)}</b></span></div></div></div>
            <a class="btn green" href="${href}">${ended?'Ver resultado':'Ver oferta e participar →'}</a>
          </div>
        </article>`;
      }).join('');
    }catch(error){
      console.error('JP Vendas por lances apresentação:',error);
      grid.innerHTML=emptyCard('Não foi possível carregar os vendas por lances agora.');
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();