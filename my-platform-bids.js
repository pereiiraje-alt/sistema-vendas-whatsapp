(()=>{
  const submenu=document.getElementById('auctionsSubmenu');
  const secondary=document.getElementById('secondaryMenuBody');
  if(!submenu||typeof db==='undefined')return;

  let btn=document.getElementById('myPlatformBidsButton');
  if(!btn){
    btn=document.createElement('button');
    btn.id='myPlatformBidsButton';
    btn.type='button';
    btn.textContent='↗ Minhas ofertas na plataforma';
    (secondary||submenu).appendChild(btn);
  }

  const PAYMENT_LIMIT_MS=10*60*1000;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>(Number(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const when=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const remain=ms=>{const s=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(s/60),r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`};

  function ensureStyles(){
    if(document.getElementById('my-platform-bids-style'))return;
    const s=document.createElement('style');
    s.id='my-platform-bids-style';
    s.textContent=`
      .mpb-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}
      .mpb-card{border:1px solid #dfe8e3;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(11,42,32,.06)}
      .mpb-img{height:150px;background:#0b2a20;display:flex;align-items:center;justify-content:center;font-size:42px;color:#fff;overflow:hidden}.mpb-img img{width:100%;height:100%;object-fit:cover}
      .mpb-body{padding:16px}.mpb-company{font-size:12px;font-weight:800;color:#16834b;text-transform:uppercase}.mpb-body h3{margin:5px 0 8px}.mpb-row{display:flex;justify-content:space-between;gap:8px;margin:7px 0;color:#5f6f67;font-size:13px}.mpb-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.mpb-live{background:#e7f8ee;color:#118044}.mpb-pay{background:#fff7ed;color:#9a3412}.mpb-done{background:#f3f4f6;color:#6b7280}.mpb-btn{display:block;text-align:center;text-decoration:none;margin-top:12px;padding:11px 12px;border-radius:10px;background:#16b85d;color:#fff;font-weight:800}.mpb-note{margin-top:12px;color:#64748b;font-size:13px}
    `;
    document.head.appendChild(s);
  }

  async function render(){
    ensureStyles();
    title.textContent='Minhas ofertas na plataforma';
    subtitle.textContent='Acompanhe vendas de outras empresas e pagamentos pendentes';
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===btn));
    app.innerHTML='<div class="panel"><h3>Minhas ofertas</h3><p class="muted">Carregando os vendas em que você participou...</p></div>';

    try{
      const session=await db.auth.getSession();
      const user=session?.data?.session?.user;
      if(!user)throw new Error('Sua sessão expirou. Entre novamente.');

      const {data:participants,error:pErr}=await db.from('participants').select('id,company_id').eq('auth_user_id',user.id);
      if(pErr)throw pErr;
      const ownCompanyId=currentCompany?.id||null;
      const relevant=(participants||[]).filter(p=>!ownCompanyId||String(p.company_id)!==String(ownCompanyId));
      const participantIds=relevant.map(p=>p.id);
      if(!participantIds.length){app.innerHTML='<div class="panel"><h3>Minhas ofertas na plataforma</h3><p class="muted">Você ainda não deu ofertas em vendas de outras empresas.</p></div>';return}

      const {data:bids,error:bErr}=await db.from('bids').select('participant_id,lot_id,amount,created_at').in('participant_id',participantIds).order('created_at',{ascending:false});
      if(bErr)throw bErr;
      if(!bids?.length){app.innerHTML='<div class="panel"><h3>Minhas ofertas na plataforma</h3><p class="muted">Você ainda não deu ofertas em vendas de outras empresas.</p></div>';return}

      const latestByLot=new Map();
      for(const bid of bids){if(!latestByLot.has(bid.lot_id))latestByLot.set(bid.lot_id,bid)}
      const lotIds=[...latestByLot.keys()];
      const {data:lots,error:lErr}=await db.from('lots').select('id,company_id,auction_id,lot_number,title,image_url,current_bid,starting_bid,ends_at,status').in('id',lotIds);
      if(lErr)throw lErr;
      const companyIds=[...new Set((lots||[]).map(l=>l.company_id).filter(Boolean))];
      const [{data:companies},{data:wins}]=await Promise.all([
        companyIds.length?db.from('companies').select('id,name').in('id',companyIds):Promise.resolve({data:[]}),
        db.from('arremates').select('id,lot_id,participant_id,winning_bid,total_amount,created_at').in('lot_id',lotIds)
      ]);
      const companyMap=new Map((companies||[]).map(c=>[String(c.id),c.name||'Empresa parceira']));
      const participantSet=new Set(participantIds.map(String));
      const myWins=(wins||[]).filter(w=>participantSet.has(String(w.participant_id)));
      const winByLot=new Map(myWins.map(w=>[String(w.lot_id),w]));
      let payments=[];
      const arremateIds=myWins.map(w=>w.id).filter(Boolean);
      if(arremateIds.length){const r=await db.from('payments').select('arremate_id,status,amount,paid_at').in('arremate_id',arremateIds);payments=r.data||[]}
      const paymentMap=new Map(payments.map(p=>[String(p.arremate_id),p]));

      const rows=(lots||[]).map(lot=>{
        const bid=latestByLot.get(lot.id)||{};
        const win=winByLot.get(String(lot.id));
        const payment=win?paymentMap.get(String(win.id)):null;
        return {lot,bid,win,payment};
      }).sort((a,b)=>{
        const ae=a.lot.ends_at?new Date(a.lot.ends_at).getTime():Infinity,be=b.lot.ends_at?new Date(b.lot.ends_at).getTime():Infinity;
        const an=ae>Date.now(),bn=be>Date.now();if(an!==bn)return an?-1:1;return be-ae;
      });

      const renderCards=()=>{
        const now=Date.now();
        const html=rows.map(({lot,bid,win,payment})=>{
          const end=lot.ends_at?new Date(lot.ends_at).getTime():null;
          const active=!end||end>now;
          let badge='<span class="mpb-badge mpb-live">● Venda ao vivo</span>';
          let action='Voltar para o venda';
          let extra='';
          if(!active){
            if(win){
              const deadline=new Date(win.created_at).getTime()+PAYMENT_LIMIT_MS;
              if(payment?.status==='paid'){badge='<span class="mpb-badge mpb-done">✓ Pagamento aprovado</span>';action='Ver arremate';}
              else if(payment?.status==='cancelled'||deadline<=now){badge='<span class="mpb-badge mpb-done">Prazo encerrado</span>';action='Ver resultado';}
              else{badge='<span class="mpb-badge mpb-pay">⚠ Pagamento pendente</span>';action='Continuar pagamento';extra=`<div class="mpb-row"><b>Tempo para pagar</b><strong class="mpb-payment-clock" data-deadline="${deadline}">${remain(deadline-now)}</strong></div>`;}
            }else{badge='<span class="mpb-badge mpb-done">Venda encerrado</span>';action='Ver resultado';}
          }
          const image=lot.image_url?`<img src="${safe(lot.image_url)}" alt="${safe(lot.title||'Produto')}">`:'🔨';
          return `<article class="mpb-card"><div class="mpb-img">${image}</div><div class="mpb-body"><div class="mpb-company">${safe(companyMap.get(String(lot.company_id))||'Empresa parceira')}</div><h3>${safe(lot.title||`Produto #${lot.lot_number||''}`)}</h3>${badge}<div class="mpb-row"><span>Seu último oferta</span><b>${money(bid.amount)}</b></div><div class="mpb-row"><span>Oferta atual</span><b>${money(lot.current_bid||lot.starting_bid)}</b></div><div class="mpb-row"><span>${active?'Termina em':'Encerrado em'}</span><span>${when(lot.ends_at)}</span></div>${extra}<a class="mpb-btn" href="/?produto=${encodeURIComponent(lot.id)}">${action}</a></div></article>`;
        }).join('');
        app.innerHTML=`<div class="panel"><h3>Vendas em que você deu oferta</h3><p class="muted">Esta lista fica salva na sua conta. Você pode sair da página e voltar depois sem perder o acompanhamento do venda ou do prazo de pagamento.</p><div class="mpb-grid">${html}</div></div>`;
      };
      renderCards();
      const timer=setInterval(()=>{
        if(!document.body.contains(btn)||!btn.classList.contains('active')){clearInterval(timer);return}
        document.querySelectorAll('.mpb-payment-clock').forEach(el=>{const d=Number(el.dataset.deadline);el.textContent=remain(d-Date.now())});
      },1000);
    }catch(error){
      console.error('Minhas ofertas na plataforma:',error);
      app.innerHTML=`<div class="panel"><h3>Minhas ofertas na plataforma</h3><p>Não foi possível carregar agora: ${safe(error.message||error)}</p></div>`;
    }
  }

  btn.onclick=render;
  window.renderMyPlatformBids=render;
})();