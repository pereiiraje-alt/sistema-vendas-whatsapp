(()=>{
  if(typeof db==='undefined'||typeof pages==='undefined')return;
  const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmtDate=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
  const labels={
    duvida:'Dúvida',pagamento:'Pagamento',mercado_pago:'Mercado Pago',leilao:'Leilão',acesso:'Acesso',erro:'Erro no sistema',sugestao:'Sugestão',outro:'Outro',
    baixa:'Baixa',normal:'Normal',alta:'Alta',urgente:'Urgente',aberto:'Aberto',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando você',resolvido:'Resolvido',fechado:'Fechado'
  };

  async function sessionUser(){const{data}=await db.auth.getSession();return data?.session?.user||null}
  async function listTickets(){
    if(!currentCompany?.id)throw new Error('Empresa não identificada.');
    const{data,error}=await db.from('support_tickets').select('id,subject,category,priority,status,last_message_at,last_sender_role,client_last_read_at,created_at,updated_at').eq('company_id',currentCompany.id).order('last_message_at',{ascending:false});
    if(error)throw error;return data||[];
  }

  function isUnread(t){
    if(t.last_sender_role!=='admin'||!t.last_message_at)return false;
    const seen=t.client_last_read_at?new Date(t.client_last_read_at).getTime():0;
    return new Date(t.last_message_at).getTime()>seen;
  }

  function supportButton(){return document.querySelector('#nav [data-page="suporte"]')}
  function paintUnread(count){
    const button=supportButton();if(!button)return;
    let badge=button.querySelector('.support-unread-badge');
    if(count>0){
      if(!badge){badge=document.createElement('span');badge.className='support-unread-badge';badge.style.cssText='margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;line-height:1';button.appendChild(badge)}
      badge.textContent=String(Math.min(count,99));badge.style.display='inline-flex';
    }else if(badge){badge.style.display='none'}
  }

  async function refreshUnread(){
    try{
      if(!currentCompany?.id)return;
      const{data,error}=await db.from('support_tickets').select('last_message_at,last_sender_role,client_last_read_at').eq('company_id',currentCompany.id);
      if(error)throw error;
      paintUnread((data||[]).filter(isUnread).length);
    }catch(e){console.warn('Contador de suporte:',e?.message||e)}
  }

  async function markRead(id){
    try{
      await db.from('support_tickets').update({client_last_read_at:new Date().toISOString()}).eq('id',id);
    }catch(_){ }
    await refreshUnread();
  }

  function newTicketForm(){
    return `<div class="panel"><div class="toolbar"><div><h3 style="margin:0">Novo atendimento</h3><p class="muted">Envie sua dúvida ou problema diretamente para o suporte da JP Leilões.</p></div></div>
      <form id="supportNewForm">
        <div class="grid2"><label>Assunto<input name="subject" maxlength="160" required placeholder="Ex.: Não consigo conectar o Mercado Pago"></label><label>Categoria<select name="category"><option value="duvida">Dúvida</option><option value="pagamento">Pagamento</option><option value="mercado_pago">Mercado Pago</option><option value="leilao">Leilão</option><option value="acesso">Acesso</option><option value="erro">Erro no sistema</option><option value="sugestao">Sugestão</option><option value="outro">Outro</option></select></label></div>
        <label>Prioridade<select name="priority"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label>
        <label>Mensagem<textarea name="message" rows="5" maxlength="5000" required placeholder="Explique o que aconteceu e, se puder, diga em qual tela ocorreu."></textarea></label>
        <button class="primary" type="submit">Enviar para o suporte</button>
      </form></div>`;
  }

  async function renderSupport(){
    const host=document.getElementById('app');if(!host)return;
    host.innerHTML='<div class="panel"><p>Carregando atendimentos...</p></div>';
    try{
      const tickets=await listTickets();
      host.innerHTML=`${newTicketForm()}<div class="panel"><h3>Meus atendimentos</h3><p class="muted">Acompanhe as respostas do suporte sem sair do sistema.</p>${tickets.length?`<table><thead><tr><th>ASSUNTO</th><th>CATEGORIA</th><th>PRIORIDADE</th><th>STATUS</th><th>ÚLTIMA ATUALIZAÇÃO</th><th></th></tr></thead><tbody>${tickets.map(t=>`<tr><td><b>${isUnread(t)?'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:7px"></span>':''}${safe(t.subject)}</b></td><td>${safe(labels[t.category]||t.category)}</td><td><span class="badge">${safe(labels[t.priority]||t.priority)}</span></td><td><span class="badge ${['urgente','aberto'].includes(t.status)?'warn':''}">${safe(labels[t.status]||t.status)}</span></td><td>${safe(fmtDate(t.last_message_at||t.updated_at))}</td><td><button class="ghost mini" data-ticket="${t.id}">${isUnread(t)?'Nova resposta':'Abrir'}</button></td></tr>`).join('')}</tbody></table>`:'<p class="muted">Você ainda não abriu nenhum atendimento.</p>'}</div>`;
      document.querySelector('#supportNewForm').onsubmit=createTicket;
      document.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>openTicket(b.dataset.ticket));
      paintUnread(tickets.filter(isUnread).length);
    }catch(e){host.innerHTML=`<div class="panel"><h3>Central de Suporte</h3><p>${safe(e.message||e)}</p></div>`}
  }

  async function createTicket(e){
    e.preventDefault();
    const form=e.currentTarget,btn=form.querySelector('button[type="submit"]'),f=new FormData(form),user=await sessionUser();
    if(!user||!currentCompany?.id)return alert('Sessão ou empresa não identificada. Entre novamente.');
    const subject=String(f.get('subject')||'').trim(),message=String(f.get('message')||'').trim();
    if(subject.length<3||!message)return alert('Informe o assunto e a mensagem.');
    btn.disabled=true;btn.textContent='Enviando...';
    try{
      const{data:ticket,error}=await db.from('support_tickets').insert({company_id:currentCompany.id,opened_by:user.id,subject,category:String(f.get('category')||'duvida'),priority:String(f.get('priority')||'normal')}).select('id').single();
      if(error)throw error;
      const{error:msgError}=await db.from('support_messages').insert({ticket_id:ticket.id,sender_user_id:user.id,sender_role:'client',message});
      if(msgError)throw msgError;
      await openTicket(ticket.id);
    }catch(err){alert('Não foi possível enviar o atendimento: '+(err.message||err));btn.disabled=false;btn.textContent='Enviar para o suporte'}
  }

  async function openTicket(id){
    const host=document.getElementById('app');host.innerHTML='<div class="panel"><p>Carregando conversa...</p></div>';
    try{
      await markRead(id);
      const[{data:ticket,error:te},{data:messages,error:me}]=await Promise.all([
        db.from('support_tickets').select('*').eq('id',id).single(),
        db.from('support_messages').select('id,sender_role,message,created_at').eq('ticket_id',id).order('created_at',{ascending:true})
      ]);
      if(te)throw te;if(me)throw me;
      const closed=['resolvido','fechado'].includes(ticket.status);
      host.innerHTML=`<div class="panel"><div class="toolbar"><div><button class="ghost mini" id="backSupport">← Voltar</button><h2 style="margin:12px 0 4px">${safe(ticket.subject)}</h2><p class="muted">${safe(labels[ticket.category]||ticket.category)} · ${safe(labels[ticket.priority]||ticket.priority)} · <b>${safe(labels[ticket.status]||ticket.status)}</b></p></div>${closed?'<button class="ghost" id="reopenTicket">Reabrir atendimento</button>':'<button class="ghost" id="closeTicket">Marcar como resolvido</button>'}</div></div>
        <div class="panel"><h3>Conversa</h3><div id="supportThread">${(messages||[]).map(m=>`<div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:12px"><div class="row"><b>${m.sender_role==='admin'?'Suporte JP Leilões':'Você'}</b><small>${safe(fmtDate(m.created_at))}</small></div><p style="white-space:pre-wrap;margin-bottom:0">${safe(m.message)}</p></div>`).join('')||'<p class="muted">Nenhuma mensagem.</p>'}</div></div>
        <div class="panel"><form id="supportReplyForm"><label>Responder<textarea name="message" rows="4" maxlength="5000" required placeholder="Digite sua mensagem para o suporte"></textarea></label><button class="primary" type="submit">Enviar resposta</button></form></div>`;
      document.querySelector('#backSupport').onclick=renderSupport;
      document.querySelector('#supportReplyForm').onsubmit=e=>replyTicket(e,id);
      const close=document.querySelector('#closeTicket');if(close)close.onclick=()=>changeStatus(id,'resolvido');
      const reopen=document.querySelector('#reopenTicket');if(reopen)reopen.onclick=()=>changeStatus(id,'aberto');
    }catch(e){host.innerHTML=`<div class="panel"><p>${safe(e.message||e)}</p><button class="ghost" id="supportBackError">Voltar</button></div>`;const b=document.getElementById('supportBackError');if(b)b.onclick=renderSupport}
  }

  async function replyTicket(e,id){
    e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button'),f=new FormData(form),message=String(f.get('message')||'').trim(),user=await sessionUser();
    if(!message||!user)return;btn.disabled=true;btn.textContent='Enviando...';
    const{error}=await db.from('support_messages').insert({ticket_id:id,sender_user_id:user.id,sender_role:'client',message});
    if(error){alert(error.message);btn.disabled=false;btn.textContent='Enviar resposta';return}
    await openTicket(id);
  }

  async function changeStatus(id,status){
    const{error}=await db.from('support_tickets').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(error.message);openTicket(id);
  }

  pages.suporte=[renderSupport,'Central de Suporte','Fale diretamente com o suporte da JP Leilões'];

  const nav=document.getElementById('nav');
  if(nav){
    let button=nav.querySelector('[data-page="suporte"]');
    if(!button){
      button=document.createElement('button');
      button.type='button';button.dataset.page='suporte';button.textContent='💬 Suporte';
      const mensalidade=nav.querySelector('[data-page="mensalidade"]');
      const config=nav.querySelector('[data-page="config"]');
      nav.insertBefore(button,mensalidade||config||null);
    }
    button.style.display='flex';button.style.alignItems='center';button.style.gap='8px';
    button.onclick=async()=>{
      nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button));
      const title=document.getElementById('title'),subtitle=document.getElementById('subtitle');
      if(title)title.textContent='Central de Suporte';
      if(subtitle)subtitle.textContent='Fale diretamente com o suporte da JP Leilões';
      await renderSupport();
    };
  }

  let attempts=0;
  const wait=setInterval(()=>{
    attempts++;
    if(currentCompany?.id||attempts>20){clearInterval(wait);if(currentCompany?.id)refreshUnread()}
  },500);
  setInterval(()=>{if(document.visibilityState==='visible')refreshUnread()},20000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshUnread()});
})();