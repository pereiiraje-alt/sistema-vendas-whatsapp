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
function normalize(l){return{id:l.id,companyId:l.company_id,auctionId:l.auction_id,number:l.lot_number,name:l.title,desc:l.description||'',image:l.image_url||'',valuation:+l.valuation,start:+l.starting_bid,current:+l.current_bid,step:+l.min_increment,status:l.status,starts:l.starts_at,ends:l.ends_at,winnerId:l.winner_participant_id,bids:[]}}
async function loadLots(){let q=db.from('lots').select('*').order('lot_number');if(currentCompany)q=q.eq('company_id',currentCompany.id);let{data,error}=await timeout(q,7000,'carregar lotes');if(error)throw error;lots=(data||[]).map(normalize);return lots}
async function loadPublicLot(id){let{data,error}=await timeout(db.from('lots').select('*').eq('id',id).single(),7000,'carregar produto');if(error)throw error;let l=normalize(data);let{data:a}=await timeout(db.from('auctions').select('*').eq('id',l.auctionId).single(),7000,'carregar venda');currentAuction=a||null;let{data:s}=await timeout(db.from('companies').select('id,name,city,state').eq('id',l.companyId).limit(1).maybeSingle(),7000,'carregar vendedor').catch(()=>({data:null}));currentSeller=s||null;return l}
async function loadMyContext(){let result=await timeout(db.auth.getSession(),5000,'verificar sessão');let user=result?.data?.session?.user;if(!user)return;document.querySelector('#userName').textContent=user.user_metadata?.full_name||user.email;let{data:m,error:me}=await timeout(db.from('company_members').select('company_id,role').eq('user_id',user.id).limit(1).maybeSingle(),7000,'buscar empresa');if(me)throw me;if(m){let{data:c,error:ce}=await timeout(db.from('companies').select('*').eq('id',m.company_id).single(),7000,'carregar empresa');if(ce)throw ce;currentCompany=c;document.querySelector('#companyName').textContent=c.name;let{data:a}=await timeout(db.from('auctions').select('*').eq('company_id',c.id).in('status',['draft','scheduled','live']).order('created_at',{ascending:false}).limit(1).maybeSingle(),7000,'carregar venda');currentAuction=a||null}let{data:p}=await timeout(db.from('participants').select('*').eq('auth_user_id',user.id).limit(1).maybeSingle(),7000,'buscar participante');if(p)participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id}}
async function dashboard(){
  await loadLots();
  let bids=[],participants=[],wins=[],payments=[];
  if(currentCompany){
    const results=await Promise.all([
      timeout(db.from('bids').select('id,amount,created_at,participant_id,lot_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar lances recentes').catch(()=>({data:[]})),
      timeout(db.from('participants').select('id,full_name,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(8),7000,'carregar participantes recentes').catch(()=>({data:[]})),
      timeout(db.from('arremates').select('id,winning_bid,total_amount,created_at,participant_id,lot_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar arremates recentes').catch(()=>({data:[]})),
      timeout(db.from('payments').select('id,status,amount,created_at,arremate_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(12),7000,'carregar pagamentos recentes').catch(()=>({data:[]}))
    ]);
    bids=results[0]?.data||[];
    participants=results[1]?.data||[];
    wins=results[2]?.data||[];
    payments=results[3]?.data||[];
  }

  const liveLots=lots.filter(x=>x.status==='live'&&(!x.ends||Date.now()<new Date(x.ends))).length;
  const highestBid=Math.max(0,...lots.map(x=>Number(x.current||0)),...bids.map(x=>Number(x.amount||0)));
  const totalArrematado=wins.reduce((sum,x)=>sum+Number(x.total_amount||x.winning_bid||0),0);
  const pendingPayments=payments.filter(x=>!['paid','approved'].includes(String(x.status||'').toLowerCase())&&!['cancelled','canceled'].includes(String(x.status||'').toLowerCase())).length;
  const paidAmount=payments.filter(x=>['paid','approved'].includes(String(x.status||'').toLowerCase())).reduce((sum,x)=>sum+Number(x.amount||0),0);
  const uniqueParticipants=new Set(bids.map(x=>x.participant_id).filter(Boolean)).size;
  const companyName=esc(currentCompany?.name||'sua empresa');
  const auctionTitle=esc(currentAuction?.title||'Nenhuma venda em andamento');
  const auctionEnds=currentAuction?.ends_at||lots.filter(x=>x.status==='live'&&x.ends).sort((a,b)=>new Date(a.ends)-new Date(b.ends))[0]?.ends||'';
  const shareLotId=(lots.find(x=>x.status==='live'&&(!x.ends||Date.now()<new Date(x.ends)))||lots[0])?.id||'';
  const recent=[];
  const participantNames=new Map(participants.map(p=>[String(p.id),p.full_name||'Participante']));
  bids.slice(0,4).forEach(x=>recent.push({date:x.created_at,icon:'↗',title:'Nova oferta',text:`${participantNames.get(String(x.participant_id))||'Participante'} fez uma oferta de ${money(x.amount)}`,kind:'bid'}));
  participants.slice(0,3).forEach(x=>recent.push({date:x.created_at,icon:'♙',title:'Novo interessado',text:`${x.full_name||'Participante'} entrou na venda`,kind:'participant'}));
  wins.slice(0,3).forEach(x=>recent.push({date:x.created_at,icon:'✓',title:'Produto vendido',text:`Venda concluída no valor de ${money(x.total_amount||x.winning_bid)}`,kind:'win'}));
  payments.filter(x=>['paid','approved'].includes(String(x.status||'').toLowerCase())).slice(0,3).forEach(x=>recent.push({date:x.created_at,icon:'💳',title:'Pagamento aprovado',text:`${money(x.amount)} recebido`,kind:'paid'}));
  recent.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));

  title.textContent='Dashboard';
  subtitle.textContent='Visão geral e desempenho das suas vendas';

  app.innerHTML=`
    <section class="dash-welcome">
      <div>
        <span class="dash-eyebrow">PAINEL DA EMPRESA</span>
        <h2>Bem-vindo, ${companyName}</h2>
        <p>Acompanhe suas vendas, ofertas, interessados e pagamentos em um só lugar.</p>
      </div>
      <div class="dash-top-actions">
        <button class="ghost" type="button" onclick="go('leiloes')">Ver vendas</button>
        <button class="primary" type="button" onclick="go('lotes')">＋ Criar venda</button>
      </div>
    </section>

    <div class="dash-metrics">
      <article class="dash-metric"><div class="dash-metric-icon">⚑</div><div><small>Vendas ativas</small><h3>${currentAuction?1:0}</h3><span>${liveLots} produto(s) ao vivo</span></div></article>
      <article class="dash-metric"><div class="dash-metric-icon">↗</div><div><small>Ofertas registradas</small><h3>${bids.length}</h3><span>Maior oferta ${money(highestBid)}</span></div></article>
      <article class="dash-metric"><div class="dash-metric-icon">✓</div><div><small>Total vendido</small><h3>${money(totalArrematado)}</h3><span>${wins.length} venda(s) concluída(s)</span></div></article>
      <article class="dash-metric"><div class="dash-metric-icon">💳</div><div><small>Recebido</small><h3>${money(paidAmount)}</h3><span>${pendingPayments} pagamento(s) pendente(s)</span></div></article>
    </div>

    <div class="dash-main-grid">
      <section class="panel dash-live-panel">
        <div class="dash-panel-head">
          <div><span class="dash-live-pill">${currentAuction?'● AO VIVO':'SEM VENDA ATIVA'}</span><h3>${auctionTitle}</h3></div>
          ${auctionEnds?`<div class="dash-countdown"><small>TERMINA EM</small><b class="timer" data-end="${auctionEnds}">${remaining(auctionEnds)}</b></div>`:''}
        </div>
        <div class="dash-auction-stats">
          <div><small>Produtos cadastrados</small><b>${lots.length}</b></div>
          <div><small>Interessados</small><b>${Math.max(participants.length,uniqueParticipants)}</b></div>
          <div><small>Ofertas recentes</small><b>${bids.length}</b></div>
          <div><small>Maior oferta</small><b>${money(highestBid)}</b></div>
        </div>
        <div class="dash-actions">
          <button class="primary" onclick="go('leiloes')">Abrir painel da venda</button>
          <button class="ghost" onclick="go('lotes')">＋ Novo produto</button>
          ${shareLotId?`<button class="whatsapp" onclick="shareWhats('${shareLotId}')">💬 Compartilhar</button><button class="ghost" onclick="copyOfferLink('${shareLotId}')">🔗 Copiar link</button>`:''}
          <button class="ghost" onclick="go('arrematantes')">Ver compradores</button>
        </div>
      </section>

      <section class="panel dash-quick-panel">
        <div class="dash-panel-head"><div><span class="dash-eyebrow">ATALHOS</span><h3>Ações rápidas</h3></div></div>
        <div class="dash-quick-grid">
          <button onclick="go('lotes')"><span>＋</span><b>Criar venda</b><small>Cadastre produtos e publique</small></button>
          <button onclick="go('lances')"><span>↗</span><b>Ver ofertas</b><small>Acompanhe as ofertas</small></button>
          <button onclick="go('arrematantes')"><span>✓</span><b>Compradores</b><small>Compradores e pagamentos</small></button>
          <button onclick="go('participantes')"><span>♙</span><b>Interessados</b><small>Cadastros da venda</small></button>
        </div>
      </section>
    </div>

    <div class="dash-bottom-grid">
      <section class="panel dash-activity">
        <div class="dash-panel-head"><div><span class="dash-eyebrow">EM TEMPO REAL</span><h3>Atividade recente</h3></div><button class="dash-text-btn" onclick="go('lances')">Ver histórico</button></div>
        <div class="dash-activity-list">
          ${recent.length?recent.slice(0,7).map(x=>`<div class="dash-activity-item"><span class="dash-activity-icon ${x.kind}">${x.icon}</span><div><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div><time>${x.date?new Date(x.date).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):''}</time></div>`).join(''):'<div class="dash-empty">Ainda não há atividades recentes. Quando houver ofertas, cadastros ou pagamentos, eles aparecerão aqui.</div>'}
        </div>
      </section>
      <section class="panel dash-health">
        <div class="dash-panel-head"><div><span class="dash-eyebrow">STATUS</span><h3>Operação</h3></div></div>
        <div class="dash-health-row"><span><i></i> Banco de dados</span><b>Online</b></div>
        <div class="dash-health-row"><span><i></i> Fotos e arquivos</span><b>Online</b></div>
        <div class="dash-health-row"><span><i class="${pendingPayments?'warn':''}"></i> Pagamentos pendentes</span><b>${pendingPayments}</b></div>
        <div class="dash-health-row"><span><i></i> Produtos publicados</span><b>${lots.length}</b></div>
      </section>
    </div>`;
  tick();
}

async function leiloes(){await loadLots();app.innerHTML=`<div class="auction-head"><div><span class="live">● ONLINE</span><h2>${esc(currentAuction?.title||'Suas vendas por lances')}</h2><p>Seus produtos aparecem aqui com oferta e tempo atualizados.</p></div></div><div class="catalog">${lots.map(l=>lotCard(l)).join('')||'<div class="panel"><p class="muted">Nenhum produto publicado ainda.</p></div>'}</div>`;tick()}
function lotCard(l){return `<article class="product">${img(l)}<div><small>PRODUTO #${l.number}</small><h3>${esc(l.name)}</h3><p>Avaliação: ${money(l.valuation)}</p><span class="price">${money(l.current)}</span><div class="timer" data-end="${l.ends||''}">${l.ends?remaining(l.ends):'--:--:--'}</div><button class="primary full" onclick="openLot('${l.id}')">Ver produto e ofertar</button><button class="whatsapp full" onclick="shareWhats('${l.id}')">WhatsApp</button></div></article>`}
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
      <div class="public-media-shell">${img(l,'hero-img')}</div>
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

    thumb.addEventListener('pointerdown',begin);
    thumb.addEventListener('pointermove',move);
    thumb.addEventListener('pointerup',end);
    thumb.addEventListener('pointercancel',end);
    slider.addEventListener('click',e=>e.preventDefault());
    window.addEventListener('resize',()=>{if(!dragging&&!confirmed){maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);setPosition(0);}});
    maxX=Math.max(0,slider.clientWidth-thumb.offsetWidth-leftPad*2);
    setPosition(0);
  });
}

async function bid(id){try{let l=await loadPublicLot(id);if(!participant){pendingBid=id;registerModal.showModal();return}if(participant.companyId!==l.companyId){participant=null;pendingBid=id;registerModal.showModal();return}let amount=l.current+l.step;let{error}=await timeout(db.rpc('place_bid',{p_lot_id:id,p_participant_id:participant.id,p_amount:amount}),7000,'registrar lance');if(error)throw error;await openLot(id)}catch(e){alert(e.message)}}
async function shareWhats(id){let l=lots.find(x=>x.id===id)||await loadPublicLot(id);let shareUrl=location.origin+'/?lote='+encodeURIComponent(l.id),msg=`📲 *OFERTA AO VIVO: ${l.name}*\n\n*Produto:* #${l.number}\n*Valor de referência:* ${money(l.valuation)}\n*Oferta inicial:* ${money(l.start)}\n*Oferta atual:* ${money(l.current)}\n*Próxima oferta:* ${money(l.current+l.step)}\n*Termina:* ${l.ends?endTime(l.ends):'a definir'}\n\n👉 Veja o produto e participe:\n${shareUrl}`;window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank')}
window.copyOfferLink=async function(id){const url=location.origin+'/?lote='+encodeURIComponent(id);try{await navigator.clipboard.writeText(url);alert('Link da oferta copiado. Agora é só enviar no WhatsApp.')}catch(_){prompt('Copie o link da oferta:',url)}}
async function lotes(){await loadLots();app.innerHTML=`<div class="toolbar"><input class="search" id="search" placeholder="Buscar produto..."><button class="primary" id="new" ${currentCompany?'':'disabled'}>+ Novo produto</button></div><div id="ltable"></div>`;document.querySelector('#new').onclick=()=>{if(!currentAuction)return alert('Crie ou ative uma venda antes de cadastrar produtos.');modal.showModal()};document.querySelector('#search').oninput=e=>renderLots(e.target.value);renderLots()}
function renderLots(q=''){let a=lots.filter(x=>x.name.toLowerCase().includes(q.toLowerCase()));document.querySelector('#ltable').innerHTML=`<table><thead><tr><th>FOTO</th><th>PRODUTO</th><th>AVALIAÇÃO</th><th>OFERTA ATUAL</th><th>STATUS</th><th>COMPARTILHAR</th></tr></thead><tbody>${a.map(l=>`<tr><td>${l.image?`<img class="thumb" src="${esc(l.image)}">`:'🔨'}</td><td><strong>#${l.number} · ${esc(l.name)}</strong></td><td>${money(l.valuation)}</td><td>${money(l.current)}</td><td><span class="badge">${esc(l.status)}</span></td><td><button class="whatsapp mini" onclick="shareWhats('${l.id}')">WhatsApp</button></td></tr>`).join('')}</tbody></table>`}
async function lances(){if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';let{data}=await timeout(db.from('bids').select('amount,created_at,lot_id,participant_id').eq('company_id',currentCompany.id).order('created_at',{ascending:false}).limit(100),7000,'carregar lances');app.innerHTML=`<div class="panel"><h3>Histórico de ofertas</h3>${(data||[]).map(x=>`<div class="row"><span>${new Date(x.created_at).toLocaleString('pt-BR')}</span><b>${money(x.amount)}</b></div>`).join('')||'<p class="muted">Nenhuma oferta registrada.</p>'}</div>`}
async function participantes(){if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';let{data}=await timeout(db.from('participants').select('*').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar participantes');app.innerHTML=`<div class="panel"><h3>Interessados cadastrados</h3>${(data||[]).map(x=>`<div class="row"><span><b>${esc(x.full_name)}</b><br><small>${esc(x.email)} · ${esc(x.phone)}</small></span><b class="badge">${esc(x.status)}</b></div>`).join('')||'<p class="muted">Nenhum interessado cadastrado.</p>'}</div>`}
async function arrematantes(){if(!currentCompany)return app.innerHTML='<div class="panel">Faça login como empresa.</div>';let{data}=await timeout(db.from('arremates').select('winning_bid,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar arremates');app.innerHTML=`<div class="panel"><h3>Compradores</h3>${(data||[]).map(x=>`<div class="row"><span>Venda registrada<br><small>${new Date(x.created_at).toLocaleString('pt-BR')}</small></span><b>${money(x.winning_bid)}</b></div>`).join('')||'<p class="muted">Nenhuma venda finalizada.</p>'}</div>`}
function config(){app.innerHTML=`<div class="panel"><h3>Configurações</h3><p>${currentCompany?`Empresa conectada: <b>${esc(currentCompany.name)}</b>`:'Nenhuma empresa vinculada ao usuário atual.'}</p><p class="muted">A configuração do Mercado Pago será conectada na próxima etapa.</p></div>`}
function tick(){clearInterval(window._timer);window._timer=setInterval(()=>document.querySelectorAll('.timer').forEach(e=>{if(e.dataset.end)e.textContent=remaining(e.dataset.end)}),1000)}function go(name){document.querySelector(`[data-page="${name}"]`).click()}
const pages={dashboard:[dashboard,'Dashboard','Visão geral das suas vendas por lances'],leiloes:[leiloes,'Minhas vendas','Vendas publicadas e em andamento'],lotes:[lotes,'Produtos','Cadastre e gerencie os produtos'],lances:[lances,'Ofertas','Histórico de ofertas registradas'],participantes:[participantes,'Interessados','Cadastros e interessados'],arrematantes:[arrematantes,'Compradores','Compradores e pós-venda'],config:[config,'Configurações','Regras e dados da plataforma']};
document.querySelectorAll('#nav button').forEach(b=>b.onclick=async()=>{document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');let p=pages[b.dataset.page];title.textContent=p[1];subtitle.textContent=p[2];try{await p[0]()}catch(e){bootError(e.message)}document.querySelector('.sidebar').classList.remove('open')});document.querySelector('#menu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
document.querySelector('#saveLot').onclick=async e=>{e.preventDefault();if(!lotForm.checkValidity())return lotForm.reportValidity();if(!currentCompany||!currentAuction)return alert('É necessário estar vinculado a uma empresa e ter um venda ativo.');try{let image='';let file=limage.files[0];if(file){let path=`${currentCompany.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;let{error:u}=await timeout(db.storage.from('lot-images').upload(path,file),10000,'enviar foto');if(u)throw u;image=db.storage.from('lot-images').getPublicUrl(path).data.publicUrl}let{data:last}=await timeout(db.from('lots').select('lot_number').eq('auction_id',currentAuction.id).order('lot_number',{ascending:false}).limit(1).maybeSingle(),7000,'buscar último lote'),number=(last?.lot_number||0)+1,start=+lstart.value,ends=new Date(Date.now()+60000*(+lduration.value)).toISOString();let{error}=await timeout(db.from('lots').insert({company_id:currentCompany.id,auction_id:currentAuction.id,lot_number:number,title:lname.value,description:ldesc.value||'',image_url:image,valuation:+lvalue.value,starting_bid:start,current_bid:start,min_increment:+lstep.value,status:'live',starts_at:new Date().toISOString(),ends_at:ends}),7000,'salvar lote');if(error)throw error;modal.close();lotForm.reset();await lotes()}catch(e){alert('Erro ao salvar lote: '+e.message)}};
document.querySelector('#registerForm').onsubmit=async e=>{e.preventDefault();let id=pendingBid;if(!id)return;try{let l=await loadPublicLot(id);let email=remail.value.trim().toLowerCase(),password=rpassword.value;let{data,error}=await timeout(db.auth.signUp({email,password,options:{data:{full_name:rname.value.trim()}}}),7000,'criar cadastro');if(error)throw error;if(!data.user)throw new Error('Não foi possível criar o usuário.');let{data:p,error:pe}=await timeout(db.from('participants').insert({company_id:l.companyId,auth_user_id:data.user.id,full_name:rname.value.trim(),cpf:rcpf.value.trim(),phone:rphone.value.trim(),email,status:'approved'}).select().single(),7000,'salvar participante');if(pe)throw pe;participant={id:p.id,name:p.full_name,cpf:p.cpf,phone:p.phone,email:p.email,companyId:p.company_id};registerModal.close();pendingBid=null;await bid(id)}catch(e){alert('Cadastro: '+e.message)}};
(async()=>{try{app.innerHTML='<div class="panel"><p>Conectando ao banco...</p></div>';await loadMyContext();let requestedLot=new URLSearchParams(location.search).get('lote');if(requestedLot){title.textContent='Oferta do produto';subtitle.textContent='Acompanhe e faça sua oferta';await openLot(requestedLot)}else await dashboard();window.lanceCertoBootDone=true;if(statusEl){statusEl.textContent='● Banco online';statusEl.style.color=''}}catch(e){console.error(e);bootError(e.message)}})();