(()=>{
  if(typeof db==='undefined'||typeof pages==='undefined')return;
  const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const labels={duvida:'Dúvida',pagamento:'Pagamento',mercado_pago:'Mercado Pago',leilao:'Leilão',acesso:'Acesso',erro:'Erro no sistema',sugestao:'Sugestão',outro:'Outro',baixa:'Baixa',normal:'Normal',alta:'Alta',urgente:'Urgente',aberto:'Aberto',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando cliente',resolvido:'Resolvido',fechado:'Fechado'};

  async function getTickets(){
    const{data,error}=await db.from('support_tickets').select('*').order('last_message_at',{ascending:false});if(error)throw error;
    const ids=[...new Set((data||[]).map(x=>x.company_id))];let names={};
    if(ids.length){const{data:companies,error:ce}=await db.from('companies').select('id,name,email').in('id',ids);if(ce)throw ce;(companies||[]).forEach(c=>names[c.id]=c)}
    return(data||[]).map(t=>({...t,company:names[t.company_id]||null}));
  }

  async function renderSupportAdmin(){
    app.innerHTML='<div class="panel"><p>Carregando chamados...</p></div>';
    try{
      const tickets=await getTickets();
      const open=tickets.filter(t=>!['resolvido','fechado'].includes(t.status)).length,urgent=tickets.filter(t=>t.priority==='urgente'&&!['resolvido','fechado'].includes(t.status)).length;
      app.innerHTML=`<div class="cards"><div class="card"><small>Chamados abertos</small><h2>${open}</h2></div><div class="card"><small>Urgentes</small><h2>${urgent}</h2></div><div class="card"><small>Total</small><h2>${tickets.length}</h2></div></div>
        <div class="panel"><div class="toolbar"><div><h3 style="margin:0">Central de Suporte</h3><p class="muted">Atendimentos enviados pelos clientes da JP Leilões.</p></div><select id="supportFilter"><option value="todos">Todos</option><option value="aberto">Abertos</option><option value="em_atendimento">Em atendimento</option><option value="aguardando_cliente">Aguardando cliente</option><option value="resolvido">Resolvidos</option><option value="fechado">Fechados</option></select></div><div id="supportAdminTable"></div></div>`;
      const render=(filter='todos')=>{const list=filter==='todos'?tickets:tickets.filter(t=>t.status===filter);document.querySelector('#supportAdminTable').innerHTML=list.length?`<table><thead><tr><th>EMPRESA</th><th>ASSUNTO</th><th>CATEGORIA</th><th>PRIORIDADE</th><th>STATUS</th><th>ATUALIZAÇÃO</th><th></th></tr></thead><tbody>${list.map(t=>`<tr><td><b>${safe(t.company?.name||'Empresa')}</b><br><small>${safe(t.company?.email||'')}</small></td><td>${safe(t.subject)}</td><td>${safe(labels[t.category]||t.category)}</td><td><span class="badge ${t.priority==='urgente'?'warn':''}">${safe(labels[t.priority]||t.priority)}</span></td><td><span class="badge">${safe(labels[t.status]||t.status)}</span></td><td>${safe(fmt(t.last_message_at||t.updated_at))}</td><td><button class="ghost mini" data-admin-ticket="${t.id}">Abrir</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">Nenhum chamado neste filtro.</p>';document.querySelectorAll('[data-admin-ticket]').forEach(b=>b.onclick=()=>openAdminTicket(b.dataset.adminTicket));};
      document.querySelector('#supportFilter').onchange=e=>render(e.target.value);render();
    }catch(e){app.innerHTML=`<div class="panel"><h3>Central de Suporte</h3><p>${safe(e.message||e)}</p></div>`}
  }

  async function openAdminTicket(id){
    app.innerHTML='<div class="panel"><p>Carregando atendimento...</p></div>';
    try{
      const[{data:ticket,error:te},{data:messages,error:me}]=await Promise.all([
        db.from('support_tickets').select('*').eq('id',id).single(),
        db.from('support_messages').select('id,sender_role,message,created_at').eq('ticket_id',id).order('created_at',{ascending:true})
      ]);if(te)throw te;if(me)throw me;
      const{data:company}=await db.from('companies').select('name,email,phone,responsible_name').eq('id',ticket.company_id).maybeSingle();
      app.innerHTML=`<div class="panel"><div class="toolbar"><div><button class="ghost mini" id="backSupportAdmin">← Voltar</button><h2 style="margin:12px 0 4px">${safe(ticket.subject)}</h2><p class="muted">${safe(company?.name||'Empresa')} · ${safe(labels[ticket.category]||ticket.category)} · prioridade ${safe(labels[ticket.priority]||ticket.priority)}</p></div><div><label>Status<select id="adminTicketStatus"><option value="aberto">Aberto</option><option value="em_atendimento">Em atendimento</option><option value="aguardando_cliente">Aguardando cliente</option><option value="resolvido">Resolvido</option><option value="fechado">Fechado</option></select></label></div></div><div class="row"><span>Responsável</span><b>${safe(company?.responsible_name||'—')}</b></div><div class="row"><span>E-mail</span><b>${safe(company?.email||'—')}</b></div><div class="row"><span>Telefone</span><b>${safe(company?.phone||'—')}</b></div></div>
        <div class="panel"><h3>Conversa</h3>${(messages||[]).map(m=>`<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:12px"><div class="row"><b>${m.sender_role==='admin'?'Você / Suporte JP Leilões':'Cliente'}</b><small>${safe(fmt(m.created_at))}</small></div><p style="white-space:pre-wrap;margin-bottom:0">${safe(m.message)}</p></div>`).join('')||'<p class="muted">Nenhuma mensagem.</p>'}</div>
        <div class="panel"><form id="adminSupportReply"><label>Responder ao cliente<textarea name="message" rows="5" maxlength="5000" required placeholder="Digite sua resposta"></textarea></label><button class="primary" type="submit">Enviar resposta</button></form></div>`;
      const sel=document.querySelector('#adminTicketStatus');sel.value=ticket.status;sel.onchange=()=>updateAdminStatus(id,sel.value);
      document.querySelector('#backSupportAdmin').onclick=renderSupportAdmin;
      document.querySelector('#adminSupportReply').onsubmit=e=>adminReply(e,id);
    }catch(e){app.innerHTML=`<div class="panel"><p>${safe(e.message||e)}</p><button class="ghost" onclick="go('support')">Voltar</button></div>`}
  }

  async function adminReply(e,id){
    e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button'),message=String(new FormData(form).get('message')||'').trim();if(!message)return;
    btn.disabled=true;btn.textContent='Enviando...';
    const{data}=await db.auth.getSession();const user=data?.session?.user;if(!user)return alert('Sessão expirada.');
    const{error}=await db.from('support_messages').insert({ticket_id:id,sender_user_id:user.id,sender_role:'admin',message});
    if(error){alert(error.message);btn.disabled=false;btn.textContent='Enviar resposta';return}
    await db.from('support_tickets').update({status:'aguardando_cliente',updated_at:new Date().toISOString()}).eq('id',id);
    openAdminTicket(id);
  }

  async function updateAdminStatus(id,status){const{error}=await db.from('support_tickets').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)alert(error.message)}

  pages.support=[renderSupportAdmin,'Suporte','Central de atendimento aos clientes'];
})();