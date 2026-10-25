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
async function loadPublicLot(id){
  const lotId=String(id||'').trim();
  if(!lotId)throw new Error('Produto não informado.');
  let{data,error}=await timeout(db.from('lots').select('*').eq('id',lotId).limit(1).maybeSingle(),7000,'carregar produto');
  if(error)throw error;
  if(!data)throw new Error('Produto não encontrado ou não está mais disponível.');
  let l=normalize(data);
  let auctionResult=await timeout(db.from('auctions').select('*').eq('id',l.auctionId).limit(1).maybeSingle(),7000,'carregar venda').catch(()=>({data:null,error:null}));
  currentAuction=auctionResult?.data||null;
  let{data:s}=await timeout(db.from('companies').select('id,name,city,state').eq('id',l.companyId).limit(1).maybeSingle(),7000,'carregar vendedor').catch(()=>({data:null}));
  currentSeller=s||null;
  return l
}
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
        ${currentAuction?'<button class="ghost" onclick="go(\'leiloes\')">Ver venda</button>':''}
        <button class="primary" onclick="openQuickAuction()">＋ Criar venda</button>
        <button class="whatsapp" onclick="openWhatsappSettings()">💬 Conectar WhatsApp</button>
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
  const scheduled=l.status==='scheduled'&&l.starts&&Date.now()<new Date(l.starts);
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
      <div class="public-live-badge">${ended?'ENCERRADO':scheduled?'◷ AGENDADO':'● AO VIVO'}</div>
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
        ${ended?`<div class="ended"><small>RESULTADO DA VENDA</small><h3>Venda encerrada</h3><div class="bigprice">${money(l.current)}</div><p>${l.winnerId?'Produto vendido.':'Aguardando confirmação do resultado.'}</p></div>`:scheduled?`<div class="scheduled-sale-box"><small>VENDA AGENDADA</small><h3>Os lances ainda não começaram</h3><p>Esta oferta abre em:</p><div class="bigtime timer" data-end="${l.starts}">${remaining(l.starts)}</div><span>Início: ${endTime(l.starts)}</span></div>`:`
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

async function bid(id){try{let l=await loadPublicLot(id);if(l.status==='scheduled'&&l.starts&&Date.now()<new Date(l.starts))throw new Error('Este leilão ainda não começou. Aguarde o horário agendado.');if(!participant){pendingBid=id;registerModal.showModal();return}if(participant.companyId!==l.companyId){participant=null;pendingBid=id;registerModal.showModal();return}let amount=l.current+l.step;const bidClient=window.jpQuickBidClient||db;let{error}=await timeout(bidClient.rpc('place_bid',{p_lot_id:id,p_participant_id:participant.id,p_amount:amount}),7000,'registrar lance');if(error)throw error;await openLot(id)}catch(e){alert(e.message)}}
function offerShareUrl(id){
  const token=String(id||'').replace(/-/g,'');
  return new URL('/o/'+encodeURIComponent(token),location.origin).toString();
}
async function shareWhats(id){
  const l=lots.find(x=>x.id===id)||await loadPublicLot(id);
  const shareUrl=offerShareUrl(l.id);
  const msg=`🚨 *BORA PARA MAIS UM LEILÃO!* 🚨\n\n🔨 *${l.name||'JP Leilões'}*\n\n📦 Produto #${l.number||'-'}\n💰 Avaliação: ${money(l.valuation)}\n🔥 Lance inicial: ${money(l.start)}\n➕ Acréscimo mínimo: ${money(l.step)}\n\n🕐 Começa: ${l.starts?endTime(l.starts):'agora'}\n⏳ Termina: ${l.ends?endTime(l.ends):'a definir'}\n\n👉 *Clique no link abaixo e faça sua oferta:*\n\n${shareUrl}\n\n🚨 *Não fique de fora. Bora para mais um leilão!* 🔨`;
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
function updateLotWhatsappSummary(){
  const summary=document.getElementById('lotWhatsappSummary');
  if(!summary)return;
  const checked=[...document.querySelectorAll('#lotWhatsappGroups input[type="checkbox"]:checked')];
  summary.textContent=checked.length?checked.length+' grupo(s) selecionado(s)':'Nenhum grupo selecionado';
}
window.updateLotWhatsappSummary=updateLotWhatsappSummary;

function setupLotWhatsappPicker(){
  const toggle=document.getElementById('lotWhatsappToggle');
  const wrap=document.getElementById('lotWhatsappGroupsWrap');
  if(!toggle||!wrap)return;
  toggle.onclick=()=>{
    wrap.hidden=!wrap.hidden;
    toggle.textContent=wrap.hidden?'Escolher grupos':'Ocultar grupos';
  };
  wrap.addEventListener('change',e=>{
    if(e.target?.matches?.('input[type="checkbox"]'))updateLotWhatsappSummary();
  });
  wrap.hidden=true;
  toggle.textContent='Escolher grupos';
  updateLotWhatsappSummary();
}
window.setupLotWhatsappPicker=setupLotWhatsappPicker;

function setDurationPreset(value){
  const display=document.getElementById('ldurationDisplay');
  const hidden=document.getElementById('lduration');
  const customLabel=document.getElementById('durationCustomLabel');
  const buttons=[...document.querySelectorAll('#durationPresets [data-minutes]')];
  if(!display||!hidden||!customLabel)return;
  buttons.forEach(b=>b.classList.toggle('active',String(b.dataset.minutes)===String(value)));
  if(String(value)==='custom'){
    customLabel.hidden=false;
    display.required=true;
    setTimeout(()=>display.focus(),0);
    return;
  }
  const mins=Number(value)||180;
  hidden.value=String(mins);
  const h=Math.floor(mins/60),m=mins%60;
  display.value=String(h).padStart(2,'0')+'h'+String(m).padStart(2,'0')+'m';
  display.required=false;
  customLabel.hidden=true;
}
window.setDurationPreset=setDurationPreset;

function setupDurationPresets(){
  document.querySelectorAll('#durationPresets [data-minutes]').forEach(b=>{
    b.onclick=()=>setDurationPreset(b.dataset.minutes);
  });
  setDurationPreset('180');
}
window.setupDurationPresets=setupDurationPresets;

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
    updateLotWhatsappSummary();
  }catch(e){
    console.warn('Grupos do WhatsApp no cadastro:',e);
    status.textContent='Não foi possível carregar os grupos';
    box.innerHTML='<p class="muted">'+esc(e.message||String(e))+'</p><button type="button" class="ghost mini" onclick="loadLotWhatsappGroups()">Tentar novamente</button>';
  }
}
function setLotScheduleMode(mode){
  const startInput=document.getElementById('lotStartAt');
  const startLabel=document.getElementById('lotStartAtLabel');
  const choice=document.getElementById('lotScheduleChoice');
  if(!startInput||!startLabel||!choice)return;
  const auctionStarts=currentAuction?.starts_at?new Date(currentAuction.starts_at):null;
  const auctionScheduled=String(currentAuction?.status||'').toLowerCase()==='scheduled'&&auctionStarts&&auctionStarts>new Date();
  const effectiveMode=mode==='scheduled'||auctionScheduled?'scheduled':'now';
  lotForm.dataset.scheduleMode=effectiveMode;
  choice.querySelectorAll('[data-lot-mode]').forEach(b=>b.classList.toggle('active',b.dataset.lotMode===effectiveMode));
  startLabel.hidden=effectiveMode!=='scheduled';
  startInput.required=effectiveMode==='scheduled';
  const local=v=>new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString().slice(0,16);
  if(effectiveMode==='scheduled'){
    const minDate=auctionScheduled?auctionStarts:new Date(Date.now()+5*60*1000);
    startInput.min=local(minDate);
    if(!startInput.value||new Date(startInput.value)<minDate)startInput.value=local(minDate);
  }else{
    startInput.value='';
    startInput.removeAttribute('min');
  }
}
window.setLotScheduleMode=setLotScheduleMode;

async function openNewLotModal(){
  if(!currentAuction)return alert('Crie ou ative uma venda antes de cadastrar produtos.');
  lotForm.reset();
  document.querySelectorAll('#lotWhatsappGroups input[type="checkbox"]').forEach(x=>x.checked=false);
  setupDurationPresets();
  setupLotWhatsappPicker();
  document.querySelectorAll('#lotScheduleChoice [data-lot-mode]').forEach(b=>{
    b.onclick=()=>setLotScheduleMode(b.dataset.lotMode);
  });
  const auctionStarts=currentAuction?.starts_at?new Date(currentAuction.starts_at):null;
  const auctionScheduled=String(currentAuction?.status||'').toLowerCase()==='scheduled'&&auctionStarts&&auctionStarts>new Date();
  setLotScheduleMode(auctionScheduled?'scheduled':'now');
  modal.showModal();
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
const DEFAULT_WHATSAPP_MESSAGE_TEMPLATES={
  product:`🚨 *BORA PARA MAIS UM LEILÃO!* 🚨

🔨 *{produto}*

📦 Produto #{numero}
💰 Avaliação: {avaliacao}
🔥 Lance inicial: {lance_inicial}
➕ Acréscimo mínimo: {incremento}

🕐 Começa: {inicio}
⏳ Termina: {fim}

👉 *Clique no link abaixo e faça sua oferta:*

{link}

🚨 *Não fique de fora. Bora para mais um leilão!* 🔨`,
  winner:`Olá {nome}! 🎉

Parabéns! Você foi o comprador de {quantidade} produto(s) no leilão da {empresa}.

🔨 Valor total arrematado: {valor_total}.

{prazo_pagamento}{pagamento}

Após a confirmação do pagamento, você receberá as informações para seguir com a retirada/entrega do produto.

JP Leilões`,
  reminder:`Olá, {nome}! Aqui é da {empresa}. Seu pagamento referente a {produtos} no valor pendente de {valor_pendente} ainda não consta como confirmado.

{pix}{link_pagamento}

Se já realizou o pagamento, desconsidere esta mensagem e nos avise para conferirmos. Obrigado!`
};
function fillWhatsappTemplate(template,values={}){
  return String(template||'').replace(/\{([a-z0-9_]+)\}/gi,(full,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]??''):full).replace(/\n{3,}/g,'\n\n').trim();
}
window.jpDefaultWhatsappMessageTemplates=DEFAULT_WHATSAPP_MESSAGE_TEMPLATES;
window.jpFillWhatsappTemplate=fillWhatsappTemplate;

async function config(){
  if(!currentCompany?.id){
    app.innerHTML='<div class="panel"><h3>Configurações</h3><p>Nenhuma empresa vinculada ao usuário atual.</p></div>';
    return;
  }
  app.innerHTML='<div class="panel"><h3>Configurações</h3><p class="muted">Carregando preferências da empresa...</p></div>';
  let {data:settings,error}=await timeout(db.from('company_whatsapp_settings')
    .select('company_id,product_message_template,winner_message_template,payment_reminder_template')
    .eq('company_id',currentCompany.id).maybeSingle(),7000,'carregar mensagens do WhatsApp');
  if(error)throw error;
  if(!settings){
    const inserted=await timeout(db.from('company_whatsapp_settings').insert({
      company_id:currentCompany.id,
      enabled:false,
      auto_send_on_publish:false,
      selected_groups:[],
      product_message_template:DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.product,
      winner_message_template:DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.winner,
      payment_reminder_template:DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.reminder
    }).select('company_id,product_message_template,winner_message_template,payment_reminder_template').single(),7000,'criar mensagens do WhatsApp');
    if(inserted.error)throw inserted.error;
    settings=inserted.data;
  }
  const product=settings.product_message_template||DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.product;
  const winner=settings.winner_message_template||DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.winner;
  const reminder=settings.payment_reminder_template||DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.reminder;
  app.innerHTML=`<div class="panel"><h3>Configurações</h3><p>Empresa conectada: <b>${esc(currentCompany.name)}</b></p></div>
  <section class="panel wa-template-settings">
    <div class="wa-template-head"><div><small>WHATSAPP</small><h2>Mensagens do WhatsApp</h2><p class="muted">Edite os textos padrão. As palavras entre chaves são preenchidas automaticamente no momento do envio.</p></div></div>

    <div class="wa-template-card">
      <h3>📣 Divulgação do produto</h3>
      <p class="muted">Usada ao enviar o produto para os grupos selecionados.</p>
      <textarea id="waProductTemplate" rows="12" maxlength="12000">${esc(product)}</textarea>
      <div class="wa-template-vars"><b>Variáveis:</b> <code>{empresa}</code> <code>{produto}</code> <code>{numero}</code> <code>{avaliacao}</code> <code>{lance_inicial}</code> <code>{incremento}</code> <code>{inicio}</code> <code>{fim}</code> <code>{link}</code></div>
    </div>

    <div class="wa-template-card">
      <h3>🏆 Comprador vencedor</h3>
      <p class="muted">Usada no botão “Enviar WhatsApp” da tela Compradores.</p>
      <textarea id="waWinnerTemplate" rows="12" maxlength="12000">${esc(winner)}</textarea>
      <div class="wa-template-vars"><b>Variáveis:</b> <code>{nome}</code> <code>{empresa}</code> <code>{quantidade}</code> <code>{valor_total}</code> <code>{prazo_pagamento}</code> <code>{pagamento}</code></div>
    </div>

    <div class="wa-template-card">
      <h3>💳 Lembrete de pagamento</h3>
      <p class="muted">Usada quando houver pagamento pendente.</p>
      <textarea id="waReminderTemplate" rows="12" maxlength="12000">${esc(reminder)}</textarea>
      <div class="wa-template-vars"><b>Variáveis:</b> <code>{nome}</code> <code>{empresa}</code> <code>{produtos}</code> <code>{valor_pendente}</code> <code>{pix}</code> <code>{link_pagamento}</code></div>
    </div>

    <div class="wa-template-actions">
      <button type="button" class="ghost" id="resetWhatsappMessages">Restaurar padrões</button>
      <button type="button" class="primary" id="saveWhatsappMessages">Salvar mensagens</button>
    </div>
    <div id="waTemplateStatus" class="muted" aria-live="polite"></div>
  </section>
  <style>
    .wa-template-settings{max-width:980px}.wa-template-head small{font-size:10px;font-weight:900;letter-spacing:.08em;color:#16864a}.wa-template-head h2{margin:5px 0 4px}
    .wa-template-card{margin-top:18px;padding:18px;border:1px solid #dce7e1;border-radius:16px;background:#fbfdfc}.wa-template-card h3{margin:0 0 5px}
    .wa-template-card textarea{width:100%;min-height:210px;box-sizing:border-box;border:1px solid #cad8d0;border-radius:12px;padding:13px;font:inherit;line-height:1.45;resize:vertical;background:#fff;color:#102019}
    .wa-template-card textarea:focus{outline:none;border-color:#18b85d;box-shadow:0 0 0 3px rgba(24,184,93,.1)}
    .wa-template-vars{margin-top:10px;font-size:12px;line-height:1.8;color:#617267}.wa-template-vars code{display:inline-block;margin:2px 3px;padding:2px 6px;border-radius:6px;background:#eef6f1;color:#0b6e3b}
    .wa-template-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}.wa-template-actions button{min-height:44px}
    #waTemplateStatus{margin-top:10px;text-align:right;font-weight:700}
    @media(max-width:650px){.wa-template-card{padding:14px}.wa-template-card textarea{min-height:240px}.wa-template-actions{display:grid;grid-template-columns:1fr}.wa-template-actions button{width:100%}}
  </style>`;

  const productEl=document.getElementById('waProductTemplate');
  const winnerEl=document.getElementById('waWinnerTemplate');
  const reminderEl=document.getElementById('waReminderTemplate');
  const status=document.getElementById('waTemplateStatus');
  document.getElementById('resetWhatsappMessages').onclick=()=>{
    productEl.value=DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.product;
    winnerEl.value=DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.winner;
    reminderEl.value=DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.reminder;
    status.textContent='Modelos padrão carregados. Clique em Salvar mensagens para confirmar.';
  };
  document.getElementById('saveWhatsappMessages').onclick=async e=>{
    const btn=e.currentTarget;
    const values={
      product_message_template:String(productEl.value||'').trim(),
      winner_message_template:String(winnerEl.value||'').trim(),
      payment_reminder_template:String(reminderEl.value||'').trim(),
      updated_at:new Date().toISOString()
    };
    if(!values.product_message_template||!values.winner_message_template||!values.payment_reminder_template){
      status.textContent='Preencha os três modelos antes de salvar.';
      return;
    }
    btn.disabled=true;btn.textContent='Salvando...';status.textContent='';
    try{
      const {error:updateError}=await db.from('company_whatsapp_settings').update(values).eq('company_id',currentCompany.id);
      if(updateError)throw updateError;
      status.textContent='✓ Mensagens salvas com sucesso.';
    }catch(saveError){
      status.textContent='Não foi possível salvar: '+(saveError.message||saveError);
    }finally{
      btn.disabled=false;btn.textContent='Salvar mensagens';
    }
  };
}
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

async function pagamentos(){
  if(!currentCompany?.id){app.innerHTML='<div class="panel">Entre como empresa para consultar pagamentos.</div>';return;}
  app.innerHTML='<div class="panel"><h3>Pagamentos</h3><p class="muted">Consultando pagamentos...</p></div>';
  const {data:payments,error}=await timeout(db.from('payments')
    .select('id,arremate_id,status,method,amount,paid_at,created_at,updated_at,checkout_url,pix_qr_code')
    .eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(500),
    10000,'carregar pagamentos');
  if(error)throw error;
  const items=payments||[];
  const saleIds=[...new Set(items.map(x=>x.arremate_id).filter(Boolean))];
  let sales=[];
  if(saleIds.length){
    const result=await timeout(db.from('arremates').select('id,lot_id,participant_id').eq('company_id',currentCompany.id).in('id',saleIds),10000,'carregar arremates');
    if(result.error)throw result.error;sales=result.data||[];
  }
  const participantIds=[...new Set(sales.map(x=>x.participant_id).filter(Boolean))];
  const lotIds=[...new Set(sales.map(x=>x.lot_id).filter(Boolean))];
  const [peopleResponse,lotsResponse]=await Promise.all([
    participantIds.length?timeout(db.from('participants').select('id,full_name,phone').eq('company_id',currentCompany.id).in('id',participantIds),10000,'carregar compradores'):Promise.resolve({data:[],error:null}),
    lotIds.length?timeout(db.from('lots').select('id,title,lot_number').eq('company_id',currentCompany.id).in('id',lotIds),10000,'carregar produtos'):Promise.resolve({data:[],error:null})
  ]);
  if(peopleResponse.error)throw peopleResponse.error;
  if(lotsResponse.error)throw lotsResponse.error;
  const {data:paymentMessageSettings,error:paymentMessageSettingsError}=await timeout(
    db.from('company_whatsapp_settings').select('payment_reminder_template').eq('company_id',currentCompany.id).maybeSingle(),
    7000,'carregar mensagem de lembrete'
  );
  if(paymentMessageSettingsError)throw paymentMessageSettingsError;
  const paymentReminderTemplate=paymentMessageSettings?.payment_reminder_template||DEFAULT_WHATSAPP_MESSAGE_TEMPLATES.reminder;
  const saleById=new Map(sales.map(x=>[x.id,x]));
  const peopleById=new Map((peopleResponse.data||[]).map(x=>[x.id,x]));
  const lotById=new Map((lotsResponse.data||[]).map(x=>[x.id,x]));
  const moneyPay=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const datePay=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
  const confirmed=items.filter(x=>x.status==='paid');
  const pending=items.filter(x=>['pending','processing'].includes(x.status));
  const cancelled=items.filter(x=>['cancelled','failed','refunded'].includes(x.status));
  const sum=rows=>rows.reduce((n,x)=>n+Number(x.amount||0),0);
  app.innerHTML=`<section class="panel"><h2>💰 Pagamentos</h2><p class="muted">Acompanhe os pagamentos registrados pelo Mercado Pago. Apenas o status aprovado aparece como confirmado.</p>
    <div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0">
      <article><small>Confirmados</small><b>${confirmed.length}</b><span>${moneyPay(sum(confirmed))}</span></article>
      <article><small>Pendentes</small><b>${pending.length}</b><span>${moneyPay(sum(pending))}</span></article>
      <article><small>Cancelados / outros</small><b>${cancelled.length}</b><span>${moneyPay(sum(cancelled))}</span></article>
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0">
      <label for="paymentFilter" style="font-weight:700">Filtrar</label>
      <select id="paymentFilter" style="max-width:240px"><option value="all">Todos</option><option value="paid">Confirmados</option><option value="pending">Pendentes</option><option value="cancelled">Cancelados / outros</option></select>
      <button type="button" class="ghost" id="reloadPayments">Atualizar pagamentos</button>
    </div>
    <div id="paymentsTable" style="overflow-x:auto"></div>
  </section>`;
  const reminderUrl=p=>{
    const sale=saleById.get(p.arremate_id);
    const person=peopleById.get(sale?.participant_id);
    const lot=lotById.get(sale?.lot_id);
    let phone=String(person?.phone||'').replace(/\D/g,'');
    if(phone.length===10||phone.length===11)phone='55'+phone;
    if(!/^\d{12,13}$/.test(phone)||!phone.startsWith('55'))return '';
    const name=String(person?.full_name||'').trim()||'Comprador';
    const title=String(lot?.title||'produto arrematado');
    const pix=p.pix_qr_code?'💠 PIX copia e cola:\n\n📦 '+title+'\n'+p.pix_qr_code:'';
    const linkPagamento=!pix&&p.checkout_url?'💳 Link para pagamento:\n'+p.checkout_url:'';
    const message=fillWhatsappTemplate(paymentReminderTemplate,{
      nome:name,
      empresa:currentCompany?.name||'JP Leilões',
      produtos:title,
      valor_pendente:moneyPay(p.amount),
      pix,
      link_pagamento:linkPagamento
    });
    return 'https://wa.me/'+phone+'?text='+encodeURIComponent(message);
  };
  const table=document.getElementById('paymentsTable');
  const show=filter=>{
    const filtered=items.filter(x=>filter==='all'||(filter==='paid'?x.status==='paid':filter==='pending'?['pending','processing'].includes(x.status):['cancelled','failed','refunded'].includes(x.status)));
    table.innerHTML=filtered.length?`<table><thead><tr><th>Comprador</th><th>Produto</th><th>Valor</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>${filtered.map(p=>{
      const sale=saleById.get(p.arremate_id),person=peopleById.get(sale?.participant_id),lot=lotById.get(sale?.lot_id);
      const label=p.status==='paid'?'✅ Pagamento confirmado':p.status==='pending'?'⏳ Pendente':p.status==='processing'?'⏳ Em análise':p.status==='cancelled'?'❌ Cancelado':p.status==='refunded'?'↩ Reembolsado':'⚠ Não aprovado';
      return `<tr><td><strong>${esc(person?.full_name||'Comprador não identificado')}</strong><br><small>${esc(person?.phone||'')}</small></td><td>${esc(lot?.title||'Produto não identificado')}${lot?.lot_number!=null?' #'+esc(lot.lot_number):''}</td><td><strong>${moneyPay(p.amount)}</strong></td><td>${label}</td><td>${datePay(p.status==='paid'?p.paid_at||p.updated_at:p.updated_at||p.created_at)}</td><td>${['pending','processing'].includes(p.status)?(reminderUrl(p)?`<a class="whatsapp mini" href="${esc(reminderUrl(p))}" target="_blank" rel="noopener noreferrer">💬 Lembrar pagamento</a>`:'<small>Sem WhatsApp válido</small>'):'—'}</td></tr>`;
    }).join('')}</tbody></table>`:'<p class="muted">Nenhum pagamento encontrado para este filtro.</p>';
  };
  show('all');
  document.getElementById('paymentFilter').onchange=e=>show(e.target.value);
  document.getElementById('reloadPayments').onclick=pagamentos;
}

const pages={dashboard:[dashboard,'Dashboard','Visão geral das suas vendas por lances'],leiloes:[leiloes,'Minhas vendas','Vendas publicadas e em andamento'],lotes:[lotes,'Produtos','Cadastre e gerencie os produtos'],lances:[lances,'Ofertas','Histórico de ofertas registradas'],participantes:[participantes,'Interessados','Cadastros e interessados'],arrematantes:[arrematantes,'Compradores','Compradores e pós-venda'],pagamentos:[pagamentos,'Pagamentos','Pagamentos confirmados, pendentes e cancelados'],config:[config,'Configurações','Regras e dados da plataforma']};
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
function showLotSuccess(){
  const success=document.getElementById('lotSuccessModal');
  if(!success)return;
  const another=document.getElementById('successCreateAnother');
  const view=document.getElementById('successViewSale');
  const dash=document.getElementById('successDashboard');
  if(another)another.onclick=async()=>{success.close();await openNewLotModal()};
  if(view)view.onclick=async()=>{success.close();await leiloes()};
  if(dash)dash.onclick=async()=>{success.close();await dashboard()};
  if(!success.open)success.showModal();
}
window.showLotSuccess=showLotSuccess;

document.querySelector('#saveLot').onclick=async e=>{e.preventDefault();const invalid=[...lotForm.querySelectorAll('input:invalid')][0];if(invalid){invalid.scrollIntoView({behavior:'smooth',block:'center'});invalid.focus({preventScroll:true});invalid.reportValidity();alert('Confira o campo: '+(invalid.closest('label')?.childNodes[0]?.textContent?.trim()||'obrigatório')+'.');return;}if(!currentCompany||!currentAuction)return alert('É necessário estar vinculado a uma empresa e ter um venda ativo.');try{
  const files=[...(limage.files||[])];
  if(files.length>8)return alert('Você pode adicionar no máximo 8 fotos por produto.');
  const allowedImageTypes=new Set(['image/jpeg','image/png','image/webp']);
  for(const file of files){
    if(!allowedImageTypes.has(String(file.type||'').toLowerCase())){
      return alert('Use somente fotos JPG, PNG ou WEBP.');
    }
    if(Number(file.size||0)>5*1024*1024){
      return alert('Cada foto pode ter no máximo 5 MB.');
    }
  }
  const images=[];
  for(const file of files){
    let path=`${currentCompany.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
    let{error:u}=await timeout(db.storage.from('lot-images').upload(path,file),12000,'enviar foto');
    if(u)throw u;
    images.push(db.storage.from('lot-images').getPublicUrl(path).data.publicUrl);
  }
  const image=images[0]||'';
  let{data:last}=await timeout(db.from('lots').select('lot_number').eq('auction_id',currentAuction.id).order('lot_number',{ascending:false}).limit(1).maybeSingle(),7000,'buscar último lote');
  const number=(last?.lot_number||0)+1,start=+lstart.value;
  const auctionStarts=currentAuction?.starts_at?new Date(currentAuction.starts_at):null;
  const auctionEnds=currentAuction?.ends_at?new Date(currentAuction.ends_at):null;
  const auctionScheduled=String(currentAuction?.status||'').toLowerCase()==='scheduled'&&auctionStarts&&auctionStarts>new Date();
  const wantsScheduled=lotForm.dataset.scheduleMode==='scheduled';
  let lotStarts;
  if(auctionScheduled){
    const chosen=document.getElementById('lotStartAt')?.value?new Date(document.getElementById('lotStartAt').value):auctionStarts;
    lotStarts=chosen<auctionStarts?auctionStarts:chosen;
  }else if(wantsScheduled){
    const raw=document.getElementById('lotStartAt')?.value;
    if(!raw)throw new Error('Escolha a data e hora para iniciar o produto.');
    lotStarts=new Date(raw);
    if(!(lotStarts>new Date()))throw new Error('A data de início precisa estar no futuro.');
  }else{
    lotStarts=new Date();
  }
  if(auctionEnds&&lotStarts>=auctionEnds)throw new Error('O produto precisa começar antes do encerramento da venda.');
  const requestedEnd=new Date(lotStarts.getTime()+60000*(+lduration.value));
  const lotEnds=auctionEnds&&requestedEnd>auctionEnds?auctionEnds:requestedEnd;
  const lotStatus=(auctionScheduled||wantsScheduled)?'scheduled':'live';
  let{data:created,error}=await timeout(db.from('lots').insert({company_id:currentCompany.id,auction_id:currentAuction.id,lot_number:number,title:lname.value,description:ldesc.value||'',image_url:image,image_urls:images,valuation:+lvalue.value,starting_bid:start,current_bid:start,min_increment:+lstep.value,status:lotStatus,starts_at:lotStarts.toISOString(),ends_at:lotEnds.toISOString()}).select('id').single(),7000,'salvar lote');
  if(error)throw error;
  const selectedWhatsappGroups=[...document.querySelectorAll('#lotWhatsappGroups input[type="checkbox"]:checked')].map(x=>x.value);
  if(created?.id&&selectedWhatsappGroups.length){
    if(typeof window.jpWhatsappSendLotToGroups==='function'){
      const sent=await window.jpWhatsappSendLotToGroups(created.id,selectedWhatsappGroups,{silent:true});
      if(sent){
        window.jpWhatsappQueuedDuringCreate={lotId:created.id,auctionId:currentAuction.id,at:Date.now()};
      }else{
        alert('Produto criado, mas não foi possível colocá-lo na fila do WhatsApp.');
      }
    }else{
      alert('Produto criado, mas a integração do WhatsApp ainda não estava pronta para enviar.');
    }
  }
  modal.close();lotForm.reset();await loadLots();showLotSuccess()
}catch(e){alert('Erro ao salvar lote: '+e.message)}};
document.querySelector('#registerForm').onsubmit=async e=>{e.preventDefault();let id=pendingBid;if(!id)return;try{let l=await loadPublicLot(id);let email=remail.value.trim().toLowerCase(),password=rpassword.value;let{data,error}=await timeout(db.auth.signUp({email,password,options:{data:{full_name:rname.value.trim()}}}),7000,'criar cadastro');if(error)throw error;if(!data.user)throw new Error('Não foi possível criar o usuário.');let{data:p,error:pe}=await timeout(db.from('participants').insert({company_id:l.companyId,auth_user_id:data.user.id,full_name:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim(),email,status:'approved'}).select().single(),7000,'salvar participante');if(pe)throw pe;participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};registerModal.close();pendingBid=null;await bid(id)}catch(e){alert('Cadastro: '+e.message)}};
(async()=>{try{app.innerHTML='<div class="panel"><p>Conectando ao banco...</p></div>';await loadMyContext();let requestedLot=new URLSearchParams(location.search).get('lote');if(requestedLot){title.textContent='Oferta do produto';subtitle.textContent='Acompanhe e faça sua oferta';await openLot(requestedLot)}else await dashboard();window.lanceCertoBootDone=true;if(statusEl){statusEl.textContent='● Banco online';statusEl.style.color=''}}catch(e){console.error(e);bootError(e.message)}})();