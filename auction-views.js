(()=>{
  const params=new URLSearchParams(location.search);
  const lotId=params.get('lote');
  if(!lotId||typeof db==='undefined')return;

  const safeCount=value=>Math.max(0,Number(value)||0);

  function renderViewCount(count){
    const existing=document.querySelector('#auctionViewCount');
    if(existing){existing.textContent=`👁 ${safeCount(count).toLocaleString('pt-BR')} visualizações`;return;}
    const lotMain=document.querySelector('.lot-main');
    if(!lotMain)return false;
    const badge=document.createElement('div');
    badge.id='auctionViewCount';
    badge.className='auction-view-count';
    badge.textContent=`👁 ${safeCount(count).toLocaleString('pt-BR')} visualizações`;
    const heading=lotMain.querySelector('h2');
    if(heading)heading.insertAdjacentElement('afterend',badge);else lotMain.prepend(badge);
    return true;
  }

  function ensureStyle(){
    if(document.querySelector('#auctionViewCountStyle'))return;
    const style=document.createElement('style');
    style.id='auctionViewCountStyle';
    style.textContent=`.auction-view-count{display:inline-flex;align-items:center;gap:6px;width:max-content;margin:4px 0 12px;padding:6px 10px;border-radius:999px;background:#eefaf3;color:#118044;font-size:13px;font-weight:800;border:1px solid #ccefd9}`;
    document.head.appendChild(style);
  }

  async function load(){
    try{
      ensureStyle();
      const {data:lot,error:lotError}=await db.from('lots').select('auction_id').eq('id',lotId).maybeSingle();
      if(lotError||!lot?.auction_id)return;
      const auctionId=lot.auction_id;
      const key=`jp-auction-view:${auctionId}`;
      let count=0;

      if(!sessionStorage.getItem(key)){
        const {data,error}=await db.rpc('increment_auction_view',{p_auction_id:auctionId});
        if(!error&&data!==null&&data!==undefined){
          count=safeCount(data);
          sessionStorage.setItem(key,'1');
        }
      }

      if(!count){
        const {data:auction}=await db.from('auctions').select('view_count').eq('id',auctionId).maybeSingle();
        count=safeCount(auction?.view_count);
      }

      let attempts=0;
      const timer=setInterval(()=>{
        attempts+=1;
        if(renderViewCount(count)||attempts>=20)clearInterval(timer);
      },250);
      renderViewCount(count);
    }catch(error){console.warn('Contador de visualizações:',error?.message||error);}
  }

  setTimeout(load,300);
})();