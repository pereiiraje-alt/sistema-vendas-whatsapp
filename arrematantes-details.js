(()=>{
  const navButton=document.querySelector('#nav button[data-page="arrematantes"]');
  if(!navButton)return;

  let rendering=false;
  let armed=false;

  const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const currency=value=>(Number(value)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateLabel=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
  const digits=value=>String(value||'').replace(/\D/g,'');
  const whatsappNumber=value=>{
    let d=digits(value).replace(/^00/,'').replace(/^0+/,'');
    if(!d)return'';
    if(d.startsWith('55')&&(d.length===12||d.length===13))return d;
    if(d.length===10||d.length===11)return `55${d}`;
    return d.startsWith('55')?d:`55${d}`;
  };
  const whatsappUrl=(phone,message='')=>{
    const number=whatsappNumber(phone);
    if(!number)return'';
    const text=message?`&text=${encodeURIComponent(message)}`:'';
    return `https://api.whatsapp.com/send?phone=${number}${text}`;
  };

  function winnerMessage(row){
    const empresa=currentCompany?.name||'JP Leilões';
    const pendente=row.pending>0?`\n\n⏱️ Seu pagamento ainda está pendente. Você tem 30 minutos a partir do encerramento do leilão para concluir o pagamento.`:'';
    const links=[...new Set((row.paymentLinks||[]).filter(Boolean))];
    const paymentBlock=links.length===1
      ?`\n\n💳 Link para pagamento:\n${links[0]}`
      :links.length>1
        ?`\n\n💳 Links para pagamento:\n${links.map((url,i)=>`${i+1}. ${url}`).join('\n')}`
        :'';
    return `Olá ${row.name}! 🎉\n\nParabéns! Você foi o comprador de ${row.count} produto(s) no leilão da ${empresa}.\n\n🔨 Valor total arrematado: ${currency(row.totalArrematado)}.${pendente}${paymentBlock}\n\nApós a confirmação do pagamento, você receberá as informações para seguir com a retirada/entrega do produto.\n\nJP Leilões`;
  }

  const dataEncode=value=>encodeURIComponent(String(value||'')).replace(/'/g,'%27');
  function cloudWhatsappButton(phone,message,label,className='winner-notify whatsapp'){
    const number=whatsappNumber(phone);
    if(!number)return `<span class="${className} disabled">Telefone indisponível</span>`;
    return `<button type="button" class="${className} cloud-wa-send" data-phone="${safe(dataEncode(number))}" data-message="${safe(dataEncode(message))}">${label}</button>`;
  }

  async function sendCloudWhatsappButton(button){
    if(!button||button.disabled)return;
    const phone=decodeURIComponent(button.dataset.phone||'');
    const message=decodeURIComponent(button.dataset.message||'');
    if(!phone||!message)return alert('Telefone ou mensagem indisponível.');
    if(typeof window.jpWhatsappSendDirect!=='function')return alert('WhatsApp ainda está carregando. Tente novamente.');
    if(!confirm('Enviar esta mensagem pelo WhatsApp conectado da empresa?'))return;
    const old=button.textContent;
    button.disabled=true;
    button.textContent='Enviando...';
    try{
      const ok=await window.jpWhatsappSendDirect(phone,message,{silent:true});
      if(!ok)throw new Error('Não foi possível colocar a mensagem na fila.');
      button.textContent='✓ Enviado';
      setTimeout(()=>{if(button.isConnected){button.textContent=old;button.disabled=false}},2500);
    }catch(e){
      button.disabled=false;
      button.textContent=old;
      alert('Não foi possível enviar o lembrete: '+(e.message||e));
    }
  }

  function ensureStyles(){
    if(document.getElementById('winner-details-style'))return;
    const style=document.createElement('style');
    style.id='winner-details-style';
    style.textContent=`
      .winner-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .winner-summary .card{min-height:110px}.winner-table-wrap{overflow:auto}
      .winner-name{display:flex;flex-direction:column;gap:3px}.winner-name strong{font-size:15px}
      .winner-contact{color:#64748b;font-size:13px}.winner-phone{color:#15803d;text-decoration:none;font-weight:700}
      .winner-paid{color:#15803d;font-weight:800}.winner-pending{color:#92400e;font-size:12px}
      .winner-actions{display:flex;gap:6px;flex-wrap:wrap;min-width:230px}.winner-notify{display:inline-flex;align-items:center;justify-content:center;padding:9px 11px;border-radius:9px;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap;border:1px solid transparent;cursor:pointer;font-family:inherit}
      .winner-notify.whatsapp{background:#16a34a;color:#fff}.winner-notify.whatsapp:hover{background:#15803d}
      .winner-notify.email{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.winner-notify.email:hover{background:#dbeafe}
      .winner-notify.disabled{opacity:.45;pointer-events:none}
      .winner-send-panel{margin-bottom:16px;border:1px solid #bbf7d0;background:linear-gradient(135deg,#f0fdf4,#ecfdf5);display:flex;align-items:center;justify-content:space-between;gap:18px}
      .winner-send-panel h3{margin-bottom:6px!important}.winner-send-panel p{margin:0;color:#52645a;line-height:1.5}.winner-send-main{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:50px;padding:12px 18px;border:0;border-radius:13px;background:#16a34a;color:#fff;text-decoration:none;font-weight:900;white-space:nowrap;box-shadow:0 10px 24px rgba(22,163,74,.2);cursor:pointer;font-family:inherit}.winner-send-main:hover{background:#15803d}.winner-send-main.disabled{opacity:.45;pointer-events:none;box-shadow:none}
      .expired-panel{margin-bottom:16px;border:1px solid #fecaca;background:#fff7f7}
      .expired-row{display:grid;grid-template-columns:1.3fr 1fr 1fr auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid #fee2e2}
      .expired-row:first-of-type{border-top:0}.expired-badge{display:inline-block;padding:5px 8px;border-radius:999px;background:#fee2e2;color:#991b1b;font-size:12px;font-weight:800}
      .contact-second{display:inline-block;text-decoration:none;background:#16a34a;color:#fff;padding:9px 12px;border-radius:9px;font-weight:800;white-space:nowrap}
      @media(max-width:900px){.winner-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.expired-row{grid-template-columns:1fr}.winner-send-panel{align-items:flex-start;flex-direction:column}.winner-send-main{width:100%}}
      @media(max-width:560px){
        .winner-summary{grid-template-columns:1fr 1fr;gap:9px}
        .winner-summary .card{min-height:92px;padding:14px}
        .winner-summary .card h2{font-size:20px;margin:7px 0 3px}
        .winner-table-wrap{overflow:visible;margin:0 -4px}
        .winner-table-wrap table,.winner-table-wrap tbody,.winner-table-wrap tr,.winner-table-wrap td{display:block;width:100%}
        .winner-table-wrap table{min-width:0;background:transparent}
        .winner-table-wrap thead{display:none}
        .winner-table-wrap tbody{display:grid;gap:12px}
        .winner-table-wrap tr{background:#fff;border:1px solid #dfe8e3;border-radius:16px;padding:15px;box-shadow:0 5px 18px rgba(16,37,27,.05)}
        .winner-table-wrap td{border:0;padding:7px 0;display:grid;grid-template-columns:118px minmax(0,1fr);gap:10px;align-items:start;font-size:13px}
        .winner-table-wrap td::before{content:attr(data-label);font-size:10px;font-weight:900;letter-spacing:.04em;color:#7a8a80;text-transform:uppercase}
        .winner-table-wrap td:first-child{display:block;padding:0 0 11px;border-bottom:1px solid #edf1ee;margin-bottom:5px}
        .winner-table-wrap td:first-child::before{display:none}
        .winner-name strong{font-size:16px}.winner-contact{font-size:12px;overflow-wrap:anywhere}
        .winner-phone{font-size:15px}
        .winner-table-wrap td.winner-actions-cell{display:block;padding-top:12px;border-top:1px solid #edf1ee;margin-top:6px}
        .winner-table-wrap td.winner-actions-cell::before{display:block;margin-bottom:8px}
        .winner-actions{display:grid;grid-template-columns:1fr;gap:8px;min-width:0}
        .winner-actions .winner-notify{width:100%;min-height:46px;font-size:13px}
        .winner-actions .winner-notify.whatsapp:first-child{background:#f59e0b;color:#fff}
        .winner-send-panel{padding:16px}.winner-send-main{min-height:46px}
      }
      @media(max-width:390px){.winner-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function reconcilePayments(){
    try{
      const session=await db.auth.getSession();
      const token=session?.data?.session?.access_token;
      if(!token||!currentCompany?.id)return;
      const response=await fetch('/api/reconcile-company-payments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({companyId:currentCompany.id})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível sincronizar os pagamentos.');
      return data;
    }catch(error){console.error('Sincronização dos pagamentos:',error);return null}
  }

  async function renderDetails(){
    if(rendering||!navButton.classList.contains('active'))return;
    rendering=true;armed=false;ensureStyles();
    try{
      if(!currentCompany){app.innerHTML='<div class="panel"><h3>Compradores</h3><p>Faça login como empresa.</p></div>';return}
      app.innerHTML='<div class="panel"><h3>Compradores</h3><p class="muted">Sincronizando pagamentos e carregando compradores...</p></div>';
      await reconcilePayments();

      const {data:wins,error:winsError}=await timeout(db.from('arremates').select('id,lot_id,participant_id,winning_bid,total_amount,created_at').eq('company_id',currentCompany.id).order('created_at',{ascending:false}),7000,'carregar compradores');
      if(winsError)throw winsError;
      if(!wins?.length){app.innerHTML='<div class="panel"><h3>Compradores</h3><p class="muted">Nenhum venda finalizado.</p></div>';return}

      const participantIds=[...new Set(wins.map(row=>row.participant_id).filter(Boolean))];
      const vendaIds=wins.map(row=>row.id).filter(Boolean);
      const lotIds=[...new Set(wins.map(row=>row.lot_id).filter(Boolean))];
      const [{data:payments,error:paymentsError},{data:bids,error:bidsError},{data:lots,error:lotsError}]=await Promise.all([
        vendaIds.length?timeout(db.from('payments').select('arremate_id,status,amount,paid_at,checkout_url').in('arremate_id',vendaIds),7000,'carregar pagamentos'):Promise.resolve({data:[],error:null}),
        lotIds.length?timeout(db.from('bids').select('lot_id,participant_id,amount,created_at').in('lot_id',lotIds).order('amount',{ascending:false}),7000,'carregar ofertas anteriores'):Promise.resolve({data:[],error:null}),
        lotIds.length?timeout(db.from('lots').select('id,title').in('id',lotIds),7000,'carregar produtos'):Promise.resolve({data:[],error:null})
      ]);
      if(paymentsError)throw paymentsError;if(bidsError)throw bidsError;if(lotsError)throw lotsError;

      const secondByLot=new Map();
      for(const win of wins){
        const candidates=(bids||[]).filter(b=>String(b.lot_id)===String(win.lot_id)&&String(b.participant_id)!==String(win.participant_id)).sort((a,b)=>Number(b.amount)-Number(a.amount));
        if(candidates[0]){secondByLot.set(String(win.lot_id),candidates[0]);participantIds.push(candidates[0].participant_id)}
      }

      const uniqueParticipantIds=[...new Set(participantIds.filter(Boolean))];
      const {data:participants,error:participantsError}=uniqueParticipantIds.length?await timeout(db.from('participants').select('id,full_name,phone,email').in('id',uniqueParticipantIds),7000,'carregar dados dos participantes'):{data:[],error:null};
      if(participantsError)throw participantsError;

      const participantMap=new Map((participants||[]).map(row=>[String(row.id),row]));
      const paymentMap=new Map((payments||[]).map(row=>[String(row.arremate_id),row]));
      const lotMap=new Map((lots||[]).map(row=>[String(row.id),row]));
      const grouped=new Map();

      for(const win of wins){
        const person=participantMap.get(String(win.participant_id))||{};
        const key=win.participant_id||win.id;
        if(!grouped.has(key))grouped.set(key,{id:key,name:person.full_name||'Comprador',phone:person.phone||'',email:person.email||'',count:0,totalArrematado:0,totalPago:0,paidCount:0,lastPaidAt:null,latest:null,pending:0,pendingAmount:0,pendingProducts:[],paymentLinks:[]});
        const item=grouped.get(key);item.count+=1;
        const amount=Number(win.total_amount||win.winning_bid||0);item.totalArrematado+=amount;
        if(!item.latest||new Date(win.created_at)>new Date(item.latest))item.latest=win.created_at;
        const payment=paymentMap.get(String(win.id));
        if(payment?.status==='paid'){item.totalPago+=Number(payment.amount||amount||0);item.paidCount++;if(payment.paid_at&&(!item.lastPaidAt||new Date(payment.paid_at)>new Date(item.lastPaidAt)))item.lastPaidAt=payment.paid_at;}
        else if(payment?.status!=='cancelled'){
          item.pending+=1;
          item.pendingAmount+=amount;
          item.pendingProducts.push(lotMap.get(String(win.lot_id))?.title||'produto arrematado');
          if(payment?.checkout_url&&!item.paymentLinks.includes(payment.checkout_url))item.paymentLinks.push(payment.checkout_url);
        }
      }

      const expiredRows=wins.filter(win=>paymentMap.get(String(win.id))?.status==='cancelled').map(win=>{
        const second=secondByLot.get(String(win.lot_id));
        const person=second?participantMap.get(String(second.participant_id)):null;
        return {win,second,person,lot:lotMap.get(String(win.lot_id))||{}};
      });

      const expiredHtml=expiredRows.length?`<div class="panel expired-panel"><h3>Pagamentos não confirmados em 30 minutos</h3><p class="muted">O venda foi cancelado. Você pode entrar em contato com o participante que fez o segunda maior oferta.</p>${expiredRows.map(row=>{const p=row.person||{};const msg=`Olá ${p.full_name||''}, você ficou com o segunda maior oferta no produto ${row.lot.title||''} da JP Leilões. O primeiro comprador não confirmou o pagamento dentro do prazo. Entre em contato conosco para verificar a possibilidade de compra.`;const wa=whatsappUrl(p.phone,msg);return `<div class="expired-row"><div><strong>${safe(row.lot.title||'Produto')}</strong><br><span class="expired-badge">Venda cancelado</span></div><div><small>2ª maior oferta</small><br><strong>${row.second?currency(row.second.amount):'Não houve outro oferta'}</strong></div><div>${p.full_name?`<strong>${safe(p.full_name)}</strong><br><small>${safe(p.email||'')}</small>`:'Sem segundo participante'}</div><div>${wa?`<a class="contact-second" target="_blank" rel="noopener" href="${wa}">Chamar no WhatsApp</a>`:'—'}</div></div>`}).join('')}</div>`:'';

      const rows=[...grouped.values()].sort((a,b)=>new Date(b.latest||0)-new Date(a.latest||0));
      const totalArrematado=rows.reduce((sum,row)=>sum+row.totalArrematado,0),totalPago=rows.reduce((sum,row)=>sum+row.totalPago,0),totalProdutos=rows.reduce((sum,row)=>sum+row.count,0);
      const latestWinner=rows[0];
      const quickNotify=latestWinner?`<div class="panel winner-send-panel"><div><h3>🏆 Novo comprador: ${safe(latestWinner.name)}</h3><p>A mensagem será enviada pelo WhatsApp da empresa${latestWinner.paymentLinks?.length?', com prazo e link de pagamento':''}.</p></div>${cloudWhatsappButton(latestWinner.phone,winnerMessage(latestWinner),'💬 Enviar WhatsApp ao comprador','winner-send-main')}</div>`:'';

      const bodyRows=rows.map(row=>{
        const directUrl=whatsappUrl(row.phone);
        const phone=directUrl?`<a class="winner-phone" href="${directUrl}" target="_blank" rel="noopener">${safe(row.phone)}</a>`:'—';
        const message=winnerMessage(row);
        const reminderText='Olá, '+row.name+'! Aqui é da JP Leilões. Seu pagamento referente a '+row.pendingProducts.join(', ')+' no valor pendente de '+currency(row.pendingAmount)+' ainda não consta como confirmado. Por favor, verifique o pagamento. Se já realizou, desconsidere esta mensagem e nos avise para conferirmos. Obrigado!';
        const reminderButton=row.pending>0?cloudWhatsappButton(row.phone,reminderText,'💬 Lembrar pagamento'):'';

        const wa=cloudWhatsappButton(row.phone,message,'💬 Enviar WhatsApp');
        const subject=encodeURIComponent('Parabéns! Você arrematou no JP Leilões');
        const email=row.email?`<a class="winner-notify email" href="mailto:${encodeURIComponent(row.email)}?subject=${subject}&body=${encodeURIComponent(message)}">E-mail</a>`:`<span class="winner-notify email disabled">E-mail</span>`;
        return `<tr>
          <td data-label="Comprador"><div class="winner-name"><strong>${safe(row.name)}</strong><span class="winner-contact">${safe(row.email||'Sem e-mail')}</span></div></td>
          <td data-label="Telefone">${phone}</td>
          <td data-label="Arremates"><strong>${row.count}</strong>${row.pending?`<br><span class="winner-pending">${row.pending} pagamento(s) pendente(s)</span>`:''}</td>
          <td data-label="Total arrematado"><strong>${currency(row.totalArrematado)}</strong></td>
          <td data-label="Total pago" class="winner-paid">${currency(row.totalPago)}${row.paidCount?`<br><span class="winner-paid">✅ ${row.pending?"Pagamento confirmado ("+row.paidCount+")":"Pagamento confirmado"}${row.lastPaidAt?` · ${dateLabel(row.lastPaidAt)}`:""}</span>`:""}${!row.paidCount&&row.pending?'<br><span class="winner-pending">Aguardando pagamento</span>':""}</td>
          <td data-label="Último arremate">${dateLabel(row.latest)}</td>
          <td data-label="Ações" class="winner-actions-cell"><div class="winner-actions">${reminderButton}${wa}${email}</div></td>
        </tr>`;
      }).join('');

      app.innerHTML=`${quickNotify}${expiredHtml}<div class="winner-summary"><div class="card"><small>Compradores</small><h2>${rows.length}</h2><span class="up">Compradores únicos</span></div><div class="card"><small>Produtos arrematados</small><h2>${totalProdutos}</h2><span class="up">Vendas finalizadas</span></div><div class="card"><small>Total arrematado</small><h2>${currency(totalArrematado)}</h2><span class="up">Valor das arrematações</span></div><div class="card"><small>Total pago</small><h2>${currency(totalPago)}</h2><span class="up">Pagamentos aprovados</span></div></div><div class="panel"><h3>Dados dos compradores</h3><p class="muted">“Lembrar pagamento” e “Enviar WhatsApp” usam diretamente o WhatsApp conectado no JP Leilões, sem abrir página externa.</p><div class="winner-table-wrap"><table><thead><tr><th>ARREMATANTE</th><th>TELEFONE</th><th>ARREMATES</th><th>TOTAL ARREMATADO</th><th>TOTAL PAGO</th><th>ÚLTIMO ARREMATE</th><th>NOTIFICAR</th></tr></thead><tbody>${bodyRows}</tbody></table></div></div>`;
    }catch(error){app.innerHTML=`<div class="panel"><h3>Compradores</h3><p>Não foi possível carregar os dados: ${safe(error.message||error)}</p></div>`}
    finally{rendering=false}
  }

  app.addEventListener('click',e=>{
    const button=e.target.closest?.('.cloud-wa-send');
    if(button)sendCloudWhatsappButton(button);
  });

  navButton.addEventListener('click',()=>{armed=true;setTimeout(()=>{if(armed&&navButton.classList.contains('active'))renderDetails()},350)});
  const observer=new MutationObserver(()=>{if(!armed||rendering||!navButton.classList.contains('active'))return;const text=app.textContent||'';if(text.includes('Compradores'))renderDetails()});
  observer.observe(app,{childList:true,subtree:true});
  window.renderCompradoresDetails=renderDetails;
})();