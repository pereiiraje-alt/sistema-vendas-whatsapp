const SUPABASE_URL='https://dsgnyfnddyxilakjwavu.supabase.co';const SUPABASE_KEY='sb_publishable_4-pk8-WndWKwy_8plTVTAA_KXUNf-Lr';
const app=document.querySelector('#app'),statusEl=document.querySelector('#dbStatus');
function bootError(message){window.lanceCertoBootDone=true;if(statusEl){statusEl.textContent='● Erro no banco';statusEl.style.color='#ef4444'}app.innerHTML=`<div class="panel"><h2>Falha na conexão com o banco</h2><p>${String(message||'Erro desconhecido').replace(/[&<>]/g,'')}</p><p class="muted">A interface continua disponível, mas os dados online não puderam ser carregados.</p><button class="primary" onclick="location.reload()">Tentar novamente</button></div>`}
if(typeof window.supabase==='undefined'){bootError('A biblioteca do Supabase não carregou. Verifique a conexão/CDN.');throw new Error('Supabase SDK indisponível')}
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const timeout=(p,ms=7000,label='operação')=>Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`Tempo limite ao executar ${label}.`)),ms))]);
let lots=[],participant=null,pendingBid=null,currentCompany=null,currentAuction=null,currentSeller=null;
const title=document.querySelector('#title'),subtitle=document.querySelector('#subtitle'),modal=document.querySelector('#modal'),registerModal=document.querySelector('#registerModal');
const money=n=>(+n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function remaining(t){let s=Math.max(0,Math.floor((new Date(t)-Date.now())/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`}
function endTime(t){return new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function img(l,cls='lot-img'){return l.image?`<img class="${cls}" src="${esc(l.image)}" alt="${esc(l.name)}">`:`<div class="photo">🔨</div>`}
function normalize(l){
  const urls=Array.isArray(l.image_urls)?l.image_urls.filter(Boolean):[];
  const cover=l.image_url||urls[0]||'';
  const images=[...new Set([cover,...urls].filter(Boolean))];
  return{id:l.id,companyId:l.company_id,auctionId:l.auction_id,number:l.lot_number,name:l.title,desc:l.description||'',image:cover,images,valuation:+l.valuation,start:+l.starting_bid,current:+l.current_bid,step:+l.min_increment,status:l.status,starts:l.starts_at,ends:l.ends_at,winnerId:l.winner_participant_id,bids:[]}
}
function productGallery(l){
  if(!l.images?.length)return '<div class="photo">🔨</div>';
  const main=l.images[0];
  const thumbs=l.images.length>1?`<div class="product-thumbs">${l.images.map((url,i)=>`<button type="button" class="product-thumb ${i===0?'active':''}" onclick="changeLotPhoto(this)" data-photo="${esc(url)}" aria-label="Ver foto ${i+1}"><img src="${esc(url)}" alt="Foto ${i+1} de ${esc(l.name)}"></button>`).join('')}</div>`:'';
  return `<div class="product-gallery"><img class="hero-img product-main-photo" src="${esc(main)}" alt="${esc(l.name)}"><span class="product-photo-count">${l.images.length} foto${l.images.length>1?'s':''}</span>${thumbs}</div>`;
}
window.changeLotPhoto=function(btn){
  const gallery=btn?.closest('.product-gallery');
  const main=gallery?.querySelector('.product-main-photo');
  const src=btn?.dataset?.photo;
  if(!main||!src)return;
  main.src=src;
  gallery.querySelectorAll('.product-thumb').forEach(x=>x.classList.toggle('active',x===btn));
};
async function loadLots(){let q=db.from('lots').select('*').order('lot_number');if(currentCompany)q=q.eq('company_id',currentCompany.id);let{data,error}=await timeout(q,7000,'carregar lotes');if(error)throw error;lots=(data||[]).map(normalize);return lots}
async function loadPublicLot(id){let{data,error}=await timeout(db.from('lots').select('*').eq('id',id).single(),7000,'carregar produto');if(error)throw error;let l=normalize(data);let{data:a}=await timeout(db.from('auctions').select('*').eq('id',l.auctionId).single(),7000,'carregar venda');currentAuction=a||null;let{data:s}=await timeout(db.from('companies').select('id,name,city,state').eq('id',l.companyId).limit(1).maybeSingle(),7000,'carregar vendedor').catch(()=>({data:null}));currentSeller=s||null;return l}
async function loadMyContext(){let result=await timeout(db.auth.getSession(),5000,'verificar sessão');let user=result?.data?.session?.user;if(!user)return;document.querySelector('#userName').textContent=user.user_metadata?.full_name||user.email;let{data:m,error:me}=await timeout(db.from('company_members').select('company_id,role').eq('user_id',user.id).limit(1).maybeSingle(),7000,'buscar empresa');if(me)throw me;if(m){let{data:c,error:ce}=await timeout(db.from('companies').select('*').eq('id',m.company_id).single(),7000,'carregar empresa');if(ce)throw ce;currentCompany=c;document.querySelector('#companyName').textContent=c.name;let{data:a}=await timeout(db.from('auctions').select('*').eq('company_id',c.id).in('status',['draft','scheduled','live']).order('created_at',{ascending:false}).limit(1).maybeSingle(),7000,'carregar venda');currentAuction=a||null}let{data:p}=await timeout(db.from('participants').select('*').eq('auth_user_id',user.id).limit(1).maybeSingle(),7000,'buscar participante');if(p)participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id}}
async function dashboard(){
  await loadLots();
  let bids=[],participants=[],wins=[],payments=[];
  if(currentCompany){
    const results=await Promise.all([
      timeout(db.from('bids').select('id,amount,created_at,participant_id,lot_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar ofertas recentes').catch(()=>({data:[]})),
      timeout(db.from('participants').select('id,full_name,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(8),7000,'carregar interessados recentes').catch(()=>({data:[]})),
      timeout(db.from('arremates').select('id,winning_bid,total_amount,created_at,participant_id,lot_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar vendas recentes').catch(()=>({data:[]})),
      timeout(db.from('payments').select('id,status,amount,created_at,arremate_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar pagamentos recentes').catch(()=>({data:[]}))
    ]);
    bids=results[0]?.data||[];
    participants=results[1]?.data||[];
    wins=results[2]?.data||[];
    payments=results[3]?.data||[];
  }

  const liveLots=lots.filter(x=>x.status==='live'&&(!x.ends||Date.now()<new Date(x.ends))).length;
  const saleIsLive=!!currentAuction&&String(currentAuction.status||'').toLowerCase()==='live'&&(!currentAuction.ends_at||Date.now()<new Date(currentAuction.ends_at));
  const highestBid=Math.max(0,...lots.map(x=>Number(x.current||0)),...bids.map(x=>Number(x.amount||0)));
  const totalSold=wins.reduce((sum,x)=>sum+Number(x.total_amount||x.winning_bid||0),0);
  const pendingPayments=payments.filter(x=>!['paid','approved'].includes(String(x.status||'').toLowerCase())&&!['cancelled','canceled'].includes(String(x.status||'').toLowerCase())).length;
  const paidAmount=payments.filter(x=>['paid','approved'].includes(String(x.status||'').toLowerCase())).reduce((sum,x)=>sum+Number(x.amount||0),0);
  const uniqueParticipants=new Set(bids.map(x=>x.participant_id).filter(Boolean)).size;
  const rawAuctionTitle=String(currentAuction?.title||'Nenhuma venda em andamento').replace(/^Leilão\b/i,'Venda');
  const auctionTitle=esc(rawAuctionTitle);
  const auctionEnds=currentAuction?.ends_at||lots.filter(x=>x.status==='live'&&x.ends).sort((a,b)=>new Date(a.ends)-new Date(b.ends))[0]?.ends||'';
  const shareLotId=(lots.find(x=>x.status==='live'&&(!x.ends||Date.now()<new Date(x.ends)))||lots[0])?.id||'';
  const recent=[];
  const participantNames=new Map(participants.map(p=>[String(p.id),p.full_name||'Interessado']));
  bids.slice(0,4).forEach(x=>recent.push({date:x.created_at,icon:'↗',title:'Nova oferta',text:`${participantNames.get(String(x.participant_id))||'Interessado'} ofereceu ${money(x.amount)}`,kind:'bid'}));
  participants.slice(0,2).forEach(x=>recent.push({date:x.created_at,icon:'♙',title:'Novo interessado',text:`${x.full_name||'Interessado'} entrou na venda`,kind:'participant'}));
  wins.slice(0,2).forEach(x=>recent.push({date:x.created_at,icon:'✓',title:'Produto vendido',text:`Venda concluída por ${money(x.total_amount||x.winning_bid)}`,kind:'win'}));
  payments.filter(x=>['paid','approved'].includes(String(x.status||'').toLowerCase())).slice(0,2).forEach(x=>recent.push({date:x.created_at,icon:'💳',title:'Pagamento aprovado',text:`${money(x.amount)} recebido`,kind:'paid'}));
  recent.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));

  title.textContent='Dashboard';
  subtitle.textContent='Resumo das suas vendas e ofertas';

  app.innerHTML=`
    <div class="dash-compact-metrics">
      <article><small>Vendas ativas</small><b>${saleIsLive?1:0}</b><span>${liveLots?liveLots+' produto(s) ao vivo':lots.length+' produto(s) cadastrado(s)'}</span></article>
      <article><small>Ofertas</small><b>${bids.length}</b><span>Maior: ${money(highestBid)}</span></article>
      <article><small>Total vendido</small><b>${money(totalSold)}</b><span>${wins.length} venda(s)</span></article>
      <article><small>Recebido</small><b>${money(paidAmount)}</b><span>${pendingPayments?pendingPayments+' pendente(s)':'Tudo em dia'}</span></article>
    </div>

    <section class="panel dash-focus-sale">
      <div class="dash-focus-head">
        <div>
          <span class="dash-live-pill">${saleIsLive?'● AO VIVO':currentAuction?'VENDA CADASTRADA':'SEM VENDA ATIVA'}</span>
          <h2>${auctionTitle}</h2>
          <p>${saleIsLive?'Acompanhe o desempenho da venda e compartilhe com seus clientes.':currentAuction?'Venda cadastrada. Publique ou reative produtos para voltar a receber ofertas.':'Crie uma venda para começar a receber ofertas.'}</p>
        </div>
        ${auctionEnds?`<div class="dash-countdown"><small>TERMINA EM</small><b class="timer" data-end="${auctionEnds}">${remaining(auctionEnds)}</b></div>`:''}
      </div>

      <div class="dash-focus-stats">
        <div><span>Produtos</span><b>${lots.length}</b></div>
        <div><span>Interessados</span><b>${Math.max(participants.length,uniqueParticipants)}</b></div>
        <div><span>Ofertas recentes</span><b>${bids.length}</b></div>
        <div><span>Maior oferta</span><b>${money(highestBid)}</b></div>
      </div>

      <div class="dash-focus-actions">
        ${currentAuction?'<button class="ghost" onclick="go(\'leiloes\')">Ver venda</button>':'<button class="primary" onclick="openFirstAuction()">＋ Criar venda</button>'}
        <button class="ghost" onclick="go('lotes')">＋ Produto</button>
        <button class="whatsapp" onclick="openWhatsappSettings()">💬 Conectar WhatsApp</button>
        ${shareLotId?`<button class="ghost" onclick="copyOfferLink('${shareLotId}')">🔗 Copiar link</button>`:''}
      </div>
    </section>

    <section class="panel dash-clean-activity">
      <div class="dash-clean-head">
        <div><small>ATIVIDADE RECENTE</small><h3>O que aconteceu por último</h3></div>
        <button class="dash-text-btn" onclick="go('lances')">Ver todas as ofertas</button>
      </div>
      <div class="dash-activity-list">
        ${recent.length?recent.slice(0,5).map(x=>`<div class="dash-activity-item"><span class="dash-activity-icon ${x.kind}">${x.icon}</span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><time>${x.date?new Date(x.date).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</time></div>`).join(''):'<div class="dash-empty">Ainda não há atividade recente. Conecte o WhatsApp e escolha os grupos para divulgar seus leilões.</div>'}
      </div>
    </section>`;
  tick();
}

async function leiloes(){await loadLots();app.innerHTML=`<div class="auction-head"><div><span class="live">● ONLINE</span><h2>${esc(currentAuction?.title||'Suas vendas por lances')}</h2><p>Seus produtos aparecem aqui com oferta e tempo atualizados.</p></div></div><div class="catalog">${lots.map(l=>lotCard(l)).join('')||'<div class="panel"><p class="muted">Nenhum produto publicado ainda.</p></div>'}</div>`;tick()}
function lotCard(l){return `<article class="product">${img(l)}<div><small>PRODUTO #${l.number}</small><h3>${esc(l.name)}</h3><p>Avaliação: ${money(l.valuation)}</p><span class="price">${money(l.current)}</span><div class="timer" data-end="${l.ends||''}">${l.ends?remaining(l.ends):'--:--:--'}</div><button class="primary full" onclick="openLot('${l.id}')">Ver produto e ofertar</button><button class="whatsapp full" onclick="sendLotToConfiguredWhatsapp('${l.id}')">WhatsApp</button></div></article>`}
async function loadBids(l){let{data,error}=await timeout(db.from('bids').select('id,amount,created_at,participant_id').eq('lot_id',l.id).order('created_at',{ascending:false}).limit(30),7000,'carregar lances');if(error)return[];let ids=[...new Set((data||[]).map(x=>x.participant_id))],names={};if(ids.length){let{data:p}=await timeout(db.from('participants').select('id,full_name').in('id',ids),7000,'carregar participantes');(p||[]).forEach(x=>names[x.id]=x.full_name)}return(data||[]).map(b=>({user:names[b.participant_id]||'Participante',value:+b.amount,time:new Date(b.created_at).getTime(),participantId:b.participant_id}))}
async function openLot(id){try{
  let l=await loadPublicLot(id);l.bids=await loadBids(l);
  let ended=l.ends&&Date.now()>=new Date(l.ends);
  const nextBid=l.current+l.step;
  const leader=l.bids[0]?.user||'Aguardando oferta';const sellerName=esc(currentSeller?.name||'Vendedor');const sellerLocation=[currentSeller?.city,currentSeller?.state].filter(Boolean).join(' - ');
  const publicTop=document.body.classList.contains('public-lot')?`<div class="public-auction-header">
    <a class="public-auction-logo" href="/apresentacao.html"><img src="/jp-leiloes-logo.svg?v=20260930-5" alt="JP Leilões"></a>
    <div class="public-auction-search">⌕ <span>Buscar produtos e ofertas...</span></div>
    <nav class="public-auction-nav"><a href="/apresentacao.html">Início</a><a href="/explorar.html">Ofertas</a><a href="/apresentacao.html#como">Como funciona</a></nav>
    <a class="public-account-link" href="/login.html">Minha conta</a>
  </div>
  <div class="public-auction-breadcrumb"><a href="/apresentacao.html">⌂ Início</a><span>›</span><a href="/explorar.html">Ofertas</a><span>›</span><b>Produto nº ${l.number}</b><button type="button" onclick="shareWhats('${l.id}')">↗ Compartilhar</button></div>`:'';
  app.innerHTML=`${publicTop}
  <div class="lot-layout public-auction-layout">
    <div class="lot-main public-lot-card">
      <div class="public-live-badge">${ended?'ENCERRADO':'● AO VIVO'}</div>
      <div class="public-media-shell">${productGallery(l)}</div>
      <div class="public-lot-info">
        <div class="public-lot-heading"><div><small>PRODUTO #${l.number}</small><h2>${esc(l.name)}</h2></div><div class="public-valuation"><span>Valor de referência</span><b>${money(l.valuation)}</b></div></div>
        <div class="public-seller-card"><div class="public-seller-icon">✓</div><div><small>VENDEDOR</small><b>${sellerName}</b><span>${sellerLocation?esc(sellerLocation):'Venda publicada na JP Leilões'}</span></div><strong>Identificado</strong></div>
        ${l.desc?`<div class="public-description"><h3>▤ Descrição do produto</h3><p>${esc(l.desc)}</p></div>`:''}
        <div class="public-rules"><h3>Como funciona esta venda</h3><div><span>↗ As ofertas ficam registradas no sistema</span><span>⏱ A maior oferta válida no encerramento vence</span><span>💳 O comprador recebe as opções de pagamento após o término</span><span>💬 O vendedor pode enviar informações pelo WhatsApp</span></div></div>
        <div class="public-share-actions"><button class="whatsapp" onclick="shareWhats('${l.id}')">💬 Compartilhar no WhatsApp</button><button class="public-copy-link" onclick="copyOfferLink('${l.id}')">🔗 Copiar link da oferta</button></div>
      </div>
    </div>
    <aside class="public-bid-column">
      <div class="bidbox">
        ${ended?`<div class="ended"><small>RESULTADO DA VENDA</small><h3>Venda encerrada</h3><div class="bigprice">${money(l.current)}</div><p>${l.winnerId?'Produto vendido.':'Aguardando confirmação do resultado.'}</p></div>`:`
          <small>OFERTA ATUAL</small>
          <div class="bigprice">${money(l.current)}</div>
          <p class="public-next-bid">Próxima oferta mínima: <b>${money(nextBid)}</b></p>
          <p class="public-leader">♛ Maior ofertante: <b>${esc(leader)}</b></p>
          <hr>
          <div class="public-time-box"><small>◷ TERMINA EM</small><div class="bigtime timer" data-end="${l.ends}">${remaining(l.ends)}</div><span>O cronômetro acompanha o encerramento desta oferta.</span></div>
          ${participant?`<div class="logged">✓ Participando como <b>${esc(participant.name)}</b></div>`:`<div class="register-call"><b>Cadastre-se para participar</b><span>Cadastro rápido para fazer sua oferta.</span></div>`}
          <div class="public-slide-bid" data-lot-id="${l.id}" data-ready="0" aria-label="Arraste para confirmar a oferta">
            <div class="slide-fill"></div>
            <div class="slide-circle" role="presentation">›</div>
            <span class="slide-label">${participant?'Arraste para ofertar '+money(nextBid):'Arraste para cadastrar e ofertar '+money(nextBid)}</span>
            <span class="slide-gavel">↗</span>
          </div>`}
      </div>
      <div class="panel bidhistory public-bid-history">
        <div class="history-head"><h3>↗ Últimas ofertas</h3><span>Atualizado em tempo real</span></div>
        ${l.bids.slice(0,8).map((b,i)=>`<div class="row ${i===0?'leader-row':''}"><span>${i===0?'♛ ':''}${esc(b.user)}</span><b>${money(b.value)}</b></div>`).join('')||'<p class="muted">Nenhuma oferta ainda — seja o primeiro!</p>'}
      </div>
    </aside>
  </div><button class="public-floating-whatsapp" onclick="shareWhats('${l.id}')" aria-label="Compartilhar no WhatsApp">💬</button>`;
  tick();
  initSlideBid();
}catch(e){app.innerHTML=`<div class="panel"><h3>Produto indisponível</h3><p>${esc(e.message)}</p></div>`}}

function initSlideBid(){
  document.querySelectorAll('.public-slide-bid[data-ready="0"]').forEach(slider=>{
    slider.dataset.ready='1';
    const thumb=slider.querySelector('.slide-circle');
    const fill=slider.querySelector('.slide-fill');
    const label=slider.querySelector('.slide-label');
    const lotId=slider.dataset.lotId;
    if(!thumb||!lotId)return;

    let dragging=false,startX=0,currentX=0,maxX=0,confirmed=false,pointerId=null;
    const leftPad=8;
    const setPosition=x=>{
      currentX=Math.max(0,Math.min(maxX,x));
      thumb.style.transform=`translate3d(${currentX}px,-50%,0)`;
      if(fill)fill.style.width=`${currentX+thumb.offsetWidth+leftPad}px`;
      const progress=maxX?currentX/maxX:0;
      if(label)label.style.opacity=String(Math.max(.2,1-progress*.65));
    };
    const reset=()=>{
      dragging=false;confirmed=false;pointerId=null;
      slider.classList.remove('dragging','confirmed');
      thumb.style.transition='transform .28s cubic-bezier(.22,.8,.22,1)';
      if(fill)fill.style.transition='width .28s cubic-bezier(.22,.8,.22,1)';
      setPosition(0);
      setTimeout(()=>{thumb.style.transition='';if(fill)fill.style.transition='';},300);
    };
    const finish=async()=>{
      if(confirmed)return;
      confirmed=true;dragging=false;slider.classList.add('confirmed');
      thumb.style.transition='transform .18s ease';
      if(fill)fill.style.transition='width .18s ease';
      setPosition(maxX);
      if(label)label.textContent='Confirmando oferta...';
      try{
        await bid(lotId);
      }finally{
        if(slider.isConnected){
          if(label)label.textContent=participant?'Arraste para ofertar':'Arraste para cadastrar e ofertar';
          setTimeout(reset,450);
        }
      }
    };
    const begin=e=>{
      if(confirmed)return;
      dragging=true;pointerId=e.pointerId;slider.classList.add('dragging');
      maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);
      startX=e.clientX-currentX;
      try{thumb.setPointerCapture(pointerId)}catch(_){}
      e.preventDefault();
    };
    const move=e=>{
      if(!dragging||confirmed||e.pointerId!==pointerId)return;
      setPosition(e.clientX-startX);
      e.preventDefault();
    };
    const end=e=>{
      if(!dragging||confirmed||e.pointerId!==pointerId)return;
      dragging=false;slider.classList.remove('dragging');
      try{thumb.releasePointerCapture(pointerId)}catch(_){}
      pointerId=null;
      if(maxX&&currentX/maxX>=.82)finish();else reset();
      e.preventDefault();
    };

    // No Safari/iOS, o gesto de toque pode ser cancelado antes do pointerup.
    // Tratar touch diretamente e manter pointer para mouse/caneta, sem duplicar.
    const touchBegin=e=>{
      if(confirmed||!e.touches.length)return;
      const t=e.touches[0];
      dragging=true;pointerId='touch';slider.classList.add('dragging');
      maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);
      startX=t.clientX-currentX;
      thumb.style.transition='none';
      if(fill)fill.style.transition='none';
      e.preventDefault();
    };
    const touchMove=e=>{
      if(!dragging||confirmed||pointerId!=='touch'||!e.touches.length)return;
      setPosition(e.touches[0].clientX-startX);
      e.preventDefault();
    };
    const touchEnd=e=>{
      if(!dragging||confirmed||pointerId!=='touch')return;
      dragging=false;pointerId=null;slider.classList.remove('dragging');
      if(maxX&&currentX/maxX>=.82)void finish();else reset();
      e.preventDefault();
    };
    thumb.addEventListener('touchstart',touchBegin,{passive:false});
    slider.addEventListener('touchmove',touchMove,{passive:false});
    slider.addEventListener('touchend',touchEnd,{passive:false});
    slider.addEventListener('touchcancel',()=>{if(pointerId==='touch')reset();});
    thumb.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')begin(e);});
    thumb.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')move(e);});
    thumb.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')end(e);});
    thumb.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch'&&dragging)reset();});
    slider.addEventListener('click',e=>e.preventDefault());
    window.addEventListener('resize',()=>{if(!dragging&&!confirmed){maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);setPosition(0);}});
    maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);
    setPosition(0);
  });
}

async function bid(id){try{let l=await loadPublicLot(id);if(!participant){pendingBid=id;registerModal.showModal();return}if(participant.companyId!==l.companyId){participant=null;pendingBid=id;registerModal.showModal();return}let amount=l.current+l.step;const bidClient=window.jpQuickBidClient||db;let{error}=await timeout(bidClient.rpc('place_bid',{p_lot_id:id,p_participant_id:participant.id,p_amount:amount}),7000,'registrar lance');if(error)throw error;await openLot(id)}catch(e){alert(e.message)}}
function offerShareUrl(id){
  const token=String(id||'').replace(/-/g,'');
  return new URL('/o/'+encodeURIComponent(token),location.origin).toString();
}
async function shareWhats(id){
  const l=lots.find(x=>x.id===id)||await loadPublicLot(id);
  const shareUrl=offerShareUrl(l.id);
  const msg=`🔨 *${l.name||'JP Leilões'}*\n\n*Produto:* #${l.number||'-'}\n*Avaliação:* ${money(l.valuation)}\n*Lance inicial:* ${money(l.start)}\n*Oferta atual:* ${money(l.current)}\n*Próxima oferta:* ${money(l.current+l.step)}\n*Acréscimo:* ${money(l.step)}\n*Começa:* ${l.starts?endTime(l.starts):'agora'}\n*Termina:* ${l.ends?endTime(l.ends):'a definir'}\n\n👉 Veja o produto e participe:\n${shareUrl}`;
  location.href='https://wa.me/?text='+encodeURIComponent(msg);
}
async function sendLotToConfiguredWhatsapp(id){
  await openLotWhatsappGroupsModal(id);
}
window.sendLotToConfiguredWhatsapp=sendLotToConfiguredWhatsapp;

async function openLotWhatsappGroupsModal(lotId){
  if(typeof window.jpWhatsappGetProductGroups!=='function'){
    alert('A integração do WhatsApp ainda está carregando. Tente novamente em instantes.');
    return;
  }

  let dialog=document.getElementById('lotWhatsappResendModal');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='lotWhatsappResendModal';
    dialog.className='lot-wa-resend-modal';
    document.body.appendChild(dialog);
  }

  dialog.dataset.lotId=lotId;
  dialog.innerHTML=`
    <form method="dialog" class="lot-wa-resend-card">
      <div class="lot-wa-resend-head">
        <div><small>WHATSAPP</small><h3>Escolha os grupos</h3><p>Marque onde deseja publicar este produto novamente.</p></div>
        <button type="button" class="lot-wa-resend-close" onclick="closeLotWhatsappGroupsModal()" aria-label="Fechar">×</button>
      </div>
      <div class="lot-wa-resend-status" data-wa-resend-status>Carregando grupos...</div>
      <div class="lot-wa-resend-list" data-wa-resend-list><p class="muted">Aguarde...</p></div>
      <div class="lot-wa-resend-actions">
        <button type="button" class="ghost" onclick="closeLotWhatsappGroupsModal()">Cancelar</button>
        <button type="button" class="whatsapp" data-wa-resend-send onclick="confirmLotWhatsappGroups()">Enviar agora</button>
      </div>
    </form>`;

  if(!dialog.open)dialog.showModal();

  const status=dialog.querySelector('[data-wa-resend-status]');
  const list=dialog.querySelector('[data-wa-resend-list]');
  const send=dialog.querySelector('[data-wa-resend-send]');
  send.disabled=true;

  try{
    const data=await window.jpWhatsappGetProductGroups();
    if(!data?.online){
      status.textContent='WhatsApp desconectado';
      list.innerHTML='<p class="muted">Conecte o WhatsApp no menu para carregar os grupos.</p>';
      return;
    }
    const groups=Array.isArray(data.groups)?data.groups:[];
    status.textContent=groups.length?groups.length+' grupo(s) disponível(is)':'Nenhum grupo encontrado';
    list.innerHTML=groups.length
      ?groups.map(g=>`<label class="lot-wa-resend-group"><input type="checkbox" value="${esc(String(g.id||''))}"><span>${esc(String(g.name||g.id||'Grupo'))}</span></label>`).join('')
      :'<p class="muted">Nenhum grupo encontrado. Atualize os grupos na opção WhatsApp.</p>';
    send.disabled=!groups.length;
  }catch(e){
    status.textContent='Não foi possível carregar os grupos';
    list.innerHTML=`<p class="muted">${esc(e.message||String(e))}</p>`;
  }
}
window.openLotWhatsappGroupsModal=openLotWhatsappGroupsModal;

function closeLotWhatsappGroupsModal(){
  const dialog=document.getElementById('lotWhatsappResendModal');
  if(dialog?.open)dialog.close();
}
window.closeLotWhatsappGroupsModal=closeLotWhatsappGroupsModal;

async function confirmLotWhatsappGroups(){
  const dialog=document.getElementById('lotWhatsappResendModal');
  if(!dialog)return;
  const lotId=dialog.dataset.lotId;
  const selected=[...dialog.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
  if(!selected.length){
    alert('Selecione pelo menos um grupo do WhatsApp.');
    return;
  }
  if(typeof window.jpWhatsappSendLotToGroups!=='function'){
    alert('A integração do WhatsApp ainda está carregando.');
    return;
  }
  const send=dialog.querySelector('[data-wa-resend-send]');
  send.disabled=true;
  const oldText=send.textContent;
  send.textContent='Enviando...';
  try{
    const ok=await window.jpWhatsappSendLotToGroups(lotId,selected,{silent:true});
    if(!ok){
      alert('Este produto já estava na fila para os grupos selecionados ou não pôde ser reenviado.');
      return;
    }
    closeLotWhatsappGroupsModal();
    const btn=[...document.querySelectorAll('button.whatsapp')].find(b=>b.getAttribute('onclick')?.includes(lotId));
    if(btn){
      const previous=btn.textContent;
      btn.textContent='✓ Enviado';
      setTimeout(()=>btn.textContent=previous||'WhatsApp',2500);
    }
  }catch(e){
    alert('Não foi possível enviar para o WhatsApp: '+(e.message||e));
  }finally{
    send.disabled=false;
    send.textContent=oldText;
  }
}
window.confirmLotWhatsappGroups=confirmLotWhatsappGroups;
window.copyOfferLink=async function(id){
  const url=offerShareUrl(id);
  try{await navigator.clipboard.writeText(url);alert('Link da oferta copiado. Agora é só enviar no WhatsApp.')}catch(_){prompt('Copie o link da oferta:',url)}
}
async function loadLotWhatsappGroups(){
  const box=document.getElementById('lotWhatsappGroups');
  const status=document.getElementById('lotWhatsappStatus');
  if(!box||!status)return;
  box.innerHTML='<p class="muted">Carregando grupos...</p>';
  status.textContent='Carregando...';
  if(typeof window.jpWhatsappGetProductGroups!=='function'){
    box.innerHTML='<p class="muted">A integração do WhatsApp ainda está carregando.</p>';
    status.textContent='Indisponível';
    return;
  }
  try{
    const data=await Promise.race([
      window.jpWhatsappGetProductGroups(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('A consulta demorou mais de 12 segundos.')),12000))
    ]);
    if(!data?.online){
      status.textContent='WhatsApp indisponível';
      box.innerHTML='<p class="muted">Não foi possível confirmar a conexão. Confira o WhatsApp no menu ou tente novamente.</p><button type="button" class="ghost mini" onclick="loadLotWhatsappGroups()">Tentar novamente</button>';
      return;
    }
    const groups=Array.isArray(data.groups)?data.groups.filter(g=>g&&g.id):[];
    status.textContent=groups.length?groups.length+' grupo(s)':'Nenhum grupo';
    box.innerHTML=groups.length
      ?groups.map(g=>`<label class="lot-wa-group"><input type="checkbox" value="${esc(String(g.id))}"><span>${esc(String(g.name||g.id||'Grupo'))}</span></label>`).join('')
      :'<p class="muted">Nenhum grupo encontrado. Atualize os grupos na opção WhatsApp.</p><button type="button" class="ghost mini" onclick="loadLotWhatsappGroups()">Tentar novamente</button>';
  }catch(e){
    console.warn('Grupos do WhatsApp no cadastro:',e);
    status.textContent='Não foi possível carregar os grupos';
    box.innerHTML='<p class="muted">'+esc(e.message||String(e))+'</p><button type="button" class="ghost mini" onclick="loadLotWhatsappGroups()">Tentar novamente</button>';
  }
}
async function openNewLotModal(){
  if(!currentAuction)return alert('Crie ou ative uma venda antes de cadastrar produtos.');
  lotForm.reset();
  document.querySelectorAll('#lotWhatsappGroups input[type="checkbox"]').forEach(x=>x.checked=false);
  modal.showModal();
  // Abrir o formulario imediatamente; a lista de grupos e carregada em paralelo.
  void loadLotWhatsappGroups();
}
window.openNewLotModal=openNewLotModal;
async function lotes(){await loadLots();app.innerHTML=`<div class="toolbar"><input class="search" id="search" placeholder="Buscar produto..."><button class="primary" id="new" ${currentCompany?'':'disabled'}>+ Novo produto</button></div><div id="ltable"></div>`;document.querySelector('#new').onclick=openNewLotModal;document.querySelector('#search').oninput=e=>renderLots(e.target.value);renderLots()}
function renderLots(q=''){let a=lots.filter(x=>x.name.toLowerCase().includes(q.toLowerCase()));document.querySelector('#ltable').innerHTML=`<table><thead><tr><th>FOTO</th><th>PRODUTO</th><th>AVALIAÇÃO</th><th>OFERTA ATUAL</th><th>STATUS</th><th>COMPARTILHAR</th></tr></thead><tbody>${a.map(l=>`<tr><td>${l.image?`<img class="thumb" src="${esc(l.image)}">`:'🔨'}</td><td><strong>#${l.number} · ${esc(l.name)}</strong></td><td>${money(l.valuation)}</td><td>${money(l.current)}</td><td><span class="badge">${esc(l.status)}</span></td><td><button class="whatsapp mini" onclick="sendLotToConfiguredWhatsapp('${l.id}')">WhatsApp</button></td></tr>`).join('')}</tbody></table>`}
async function deleteBid(id){
  if(!currentCompany)return;
  if(!confirm('Excluir este lance? O valor atual do produto será recalculado automaticamente.'))return;
  try{
    const {error}=await timeout(db.rpc('delete_company_bid',{p_bid_id:Number(id)}),7000,'excluir lance');
    if(error)throw error;
    await lances();
  }catch(e){alert('Não foi possível excluir o lance: '+(e.message||e))}
}
window.deleteBid=deleteBid;

async function lances(){
  if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';
  let{data,error}=await timeout(db.from('bids').select('id,amount,created_at,lot_id,participant_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(100),7000,'carregar lances');
  if(error)throw error;
  const rows=data||[];
  const lotIds=[...new Set(rows.map(x=>x.lot_id).filter(Boolean))];
  const participantIds=[...new Set(rows.map(x=>x.participant_id).filter(Boolean))];
  let lotsById={},participantsById={};
  if(lotIds.length){
    const {data:lotRows}=await timeout(db.from('lots').select('id,lot_number,title').in('id',lotIds),7000,'carregar produtos das ofertas');
    (lotRows||[]).forEach(x=>lotsById[x.id]=x);
  }
  if(participantIds.length){
    const {data:participantRows}=await timeout(db.from('participants').select('id,full_name').in('id',participantIds),7000,'carregar ofertantes');
    (participantRows||[]).forEach(x=>participantsById[x.id]=x);
  }
  app.innerHTML=`<div class="panel bid-history-panel"><div class="bid-history-head"><div><h3>Histórico de ofertas</h3><p class="muted">Você pode excluir um lance incorreto. O valor atual do produto será recalculado.</p></div><span class="badge">${rows.length} oferta(s)</span></div>${rows.length?`<div class="bid-admin-list">${rows.map(x=>{const lot=lotsById[x.lot_id]||{};const person=participantsById[x.participant_id]||{};return `<div class="bid-admin-row"><div class="bid-admin-main"><strong>${esc(person.full_name||'Participante')}</strong><span>${esc(lot.title||'Produto')} ${lot.lot_number!=null?'· #'+lot.lot_number:''}</span><small>${new Date(x.created_at).toLocaleString('pt-BR')}</small></div><b class="bid-admin-value">${money(x.amount)}</b><button class="bid-delete-btn" type="button" onclick="deleteBid('${x.id}')">Excluir lance</button></div>`}).join('')}</div>`:'<p class="muted">Nenhuma oferta registrada.</p>'}</div>`;
}
async function participantes(){if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';let{data}=await timeout(db.from('participants').select('*').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar participantes');app.innerHTML=`<div class="panel"><h3>Interessados cadastrados</h3>${(data||[]).map(x=>`<div class="row"><span><b>${esc(x.full_name)}</b><br><small>${esc(x.email)} · ${esc(x.phone)}</small></span><b class="badge">${esc(x.status)}</b></div>`).join('')||'<p class="muted">Nenhum interessado cadastrado.</p>'}</div>`}
async function arrematantes(){if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';let{data}=await timeout(db.from('arremates').select('winning_bid,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar arremates');app.innerHTML=`<div class="panel"><h3>Compradores</h3>${(data||[]).map(x=>`<div class="row"><span>Venda registrada<br><small>${new Date(x.created_at).toLocaleString('pt-BR')}</small></span><b>${money(x.winning_bid)}</b></div>`).join('')||'<p class="muted">Nenhuma venda finalizada.</p>'}</div>`}
function config(){app.innerHTML=`<div class="panel"><h3>Configurações</h3><p>${currentCompany?`Empresa conectada: <b>${esc(currentCompany.name)}</b>`:'Nenhuma empresa vinculada ao usuário atual.'}</p><p class="muted">A configuração do Mercado Pago será conectada na próxima etapa.</p></div>`}
function tick(){clearInterval(window._timer);window._timer=setInterval(()=>document.querySelectorAll('.timer').forEach(e=>{if(e.dataset.end)e.textContent=remaining(e.dataset.end)}),1000)}function go(name){document.querySelector(`[data-page="${name}"]`)?.click()}
async function openWhatsappSettings(){
  for(let i=0;i<12;i++){
    const btn=document.querySelector('[data-page="whatsapp"]');
    if(btn){btn.click();return}
    if(typeof window.jpWhatsappPage==='function'){await window.jpWhatsappPage();return}
    await new Promise(r=>setTimeout(r,100));
  }
  alert('A opção do WhatsApp ainda está carregando. Tente novamente em instantes.');
}
const pages={dashboard:[dashboard,'Dashboard','Visão geral das suas vendas por lances'],leiloes:[leiloes,'Minhas vendas','Vendas publicadas e em andamento'],lotes:[lotes,'Produtos','Cadastre e gerencie os produtos'],lances:[lances,'Ofertas','Histórico de ofertas registradas'],participantes:[participantes,'Interessados','Cadastros e interessados'],arrematantes:[arrematantes,'Compradores','Compradores e pós-venda'],config:[config,'Configurações','Regras e dados da plataforma']};
const sidebar=document.querySelector('.sidebar');
let mobileMenuBackdrop=document.querySelector('#mobileMenuBackdrop');
if(!mobileMenuBackdrop){
  mobileMenuBackdrop=document.createElement('button');
  mobileMenuBackdrop.id='mobileMenuBackdrop';
  mobileMenuBackdrop.type='button';
  mobileMenuBackdrop.setAttribute('aria-label','Fechar menu');
  document.body.appendChild(mobileMenuBackdrop);
}
function isMobileMenu(){return window.matchMedia('(max-width:650px)').matches}
function closeMobileMenu(){
  sidebar?.classList.remove('open');
  mobileMenuBackdrop?.classList.remove('show');
}
function openMobileMenu(){
  sidebar?.classList.add('open');
  mobileMenuBackdrop?.classList.add('show');
}
document.querySelectorAll('#nav button[data-page]').forEach(b=>b.onclick=async()=>{
  document.querySelectorAll('#nav button[data-page]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  let p=pages[b.dataset.page];
  if(!p)return;
  title.textContent=p[1];
  subtitle.textContent=p[2];
  try{await p[0]()}catch(e){bootError(e.message)}
  if(isMobileMenu())closeMobileMenu();
});
document.querySelector('#menu').onclick=e=>{
  e.preventDefault();
  e.stopPropagation();
  sidebar?.classList.contains('open')?closeMobileMenu():openMobileMenu();
};
mobileMenuBackdrop.onclick=e=>{e.preventDefault();closeMobileMenu()};

const auctionsMenu=document.querySelector('#auctionsMenu');
const auctionsMenuToggle=document.querySelector('#auctionsMenuToggle');
auctionsMenuToggle?.addEventListener('click',e=>{
  e.preventDefault();
  e.stopImmediatePropagation();
  auctionsMenu?.classList.toggle('open');
  if(isMobileMenu())openMobileMenu();
});

document.addEventListener('click',e=>{
  const more=e.target.closest?.('.nav-secondary-toggle');
  if(more){
    e.preventDefault();
    e.stopImmediatePropagation();
    more.closest('.nav-secondary-group')?.classList.toggle('open');
    if(isMobileMenu())openMobileMenu();
    return;
  }
  if(!isMobileMenu()||!sidebar?.classList.contains('open'))return;
  if(sidebar.contains(e.target)||e.target.closest?.('#menu'))return;
  closeMobileMenu();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenu()});
window.addEventListener('resize',()=>{if(!isMobileMenu())closeMobileMenu()});
document.querySelector('#saveLot').onclick=async e=>{e.preventDefault();if(!lotForm.checkValidity())return lotForm.reportValidity();if(!currentCompany||!currentAuction)return alert('É necessário estar vinculado a uma empresa e ter um venda ativo.');try{
  const files=[...(limage.files||[])];
  if(files.length>8)return alert('Você pode adicionar no máximo 8 fotos por produto.');
  const images=[];
  for(const file of files){
    let path=`${currentCompany.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    let{error:u}=await timeout(db.storage.from('lot-images').upload(path,file),12000,'enviar foto');
    if(u)throw u;
    images.push(db.storage.from('lot-images').getPublicUrl(path).data.publicUrl);
  }
  const image=images[0]||'';
  let{data:last}=await timeout(db.from('lots').select('lot_number').eq('auction_id',currentAuction.id).order('lot_number',{ascending:false}).limit(1).maybeSingle(),7000,'buscar último lote'),number=(last?.lot_number||0)+1,start=+lstart.value,ends=new Date(Date.now()+60000*(+lduration.value)).toISOString();
  let{data:created,error}=await timeout(db.from('lots').insert({company_id:currentCompany.id,auction_id:currentAuction.id,lot_number:number,title:lname.value,description:ldesc.value||'',image_url:image,image_urls:images,valuation:+lvalue.value,starting_bid:start,current_bid:start,min_increment:+lstep.value,status:'live',starts_at:new Date().toISOString(),ends_at:ends}).select('id').single(),7000,'salvar lote');
  if(error)throw error;
  const selectedWhatsappGroups=[...document.querySelectorAll('#lotWhatsappGroups input[type="checkbox"]:checked')].map(x=>x.value);
  if(created?.id&&selectedWhatsappGroups.length){
    if(typeof window.jpWhatsappSendLotToGroups==='function'){
      const sent=await window.jpWhatsappSendLotToGroups(created.id,selectedWhatsappGroups,{silent:true});
      if(!sent)alert('Produto criado, mas não foi possível colocá-lo na fila do WhatsApp.');
    }else{
      alert('Produto criado, mas a integração do WhatsApp ainda não estava pronta para enviar.');
    }
  }
  modal.close();lotForm.reset();await lotes()
}catch(e){alert('Erro ao salvar lote: '+e.message)}};
document.querySelector('#registerForm').onsubmit=async e=>{e.preventDefault();let id=pendingBid;if(!id)return;try{let l=await loadPublicLot(id);let email=remail.value.trim().toLowerCase(),password=rpassword.value;let{data,error}=await timeout(db.auth.signUp({email,password,options:{data:{full_name:rname.value.trim()}}}),7000,'criar cadastro');if(error)throw error;if(!data.user)throw new Error('Não foi possível criar o usuário.');let{data:p,error:pe}=await timeout(db.from('participants').insert({company_id:l.companyId,auth_user_id:data.user.id,full_name:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim(),email,status:'approved'}).select().single(),7000,'salvar participante');if(pe)throw pe;participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};registerModal.close();pendingBid=null;await bid(id)}catch(e){alert('Cadastro: '+e.message)}};
(async()=>{try{app.innerHTML='<div class="panel"><p>Conectando ao banco...</p></div>';await loadMyContext();let requestedLot=new URLSearchParams(location.search).get('lote');if(requestedLot){title.textContent='Oferta do produto';subtitle.textContent='Acompanhe e faça sua oferta';await openLot(requestedLot)}else await dashboard();window.lanceCertoBootDone=true;if(statusEl){statusEl.textContent='● Banco online';statusEl.style.color=''}}catch(e){console.error(e);bootError(e.message)}})();