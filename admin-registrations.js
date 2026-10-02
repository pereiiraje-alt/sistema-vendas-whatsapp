(()=>{
  async function registrations(){
    app.innerHTML='<div class="panel"><h3>Cadastros para dar lance</h3><p class="muted">Carregando participantes por leilão...</p></div>';
    const {data,error}=await db.rpc('admin_auction_participant_registrations');
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    const groups=new Map();
    for(const row of rows){
      const key=String(row.auction_id);
      if(!groups.has(key))groups.set(key,{auctionId:row.auction_id,title:row.auction_title||'Leilão',status:row.auction_status||'',company:row.company_name||'Empresa',items:[]});
      groups.get(key).items.push(row);
    }
    if(!groups.size){
      app.innerHTML='<div class="panel"><h3>Cadastros para dar lance</h3><p class="muted">Ainda não há participantes registrados em leilões.</p></div>';
      return;
    }
    const cards=[...groups.values()].map(group=>`<div class="panel" style="margin-bottom:18px"><div class="toolbar"><div><h3 style="margin:0">${esc(group.title)}</h3><p class="muted" style="margin:5px 0 0">${esc(group.company)} · ${group.items.length} participante(s)</p></div><span class="badge">${esc(group.status)}</span></div><div style="overflow:auto"><table><thead><tr><th>PARTICIPANTE</th><th>CONTATO</th><th>CPF</th><th>LOTE DE ENTRADA</th><th>CADASTRO NO LEILÃO</th></tr></thead><tbody>${group.items.map(x=>`<tr><td><b>${esc(x.participant_name||'Participante')}</b><br><small>${esc(x.participant_email||'')}</small></td><td>${esc(x.participant_phone||'—')}</td><td>${esc(x.participant_cpf||'—')}</td><td>${esc(x.lot_title||'—')}</td><td>${date(x.registered_at)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
    app.innerHTML=`<div class="cards"><div class="card"><small>Leilões com cadastros</small><h2>${groups.size}</h2><span class="up">Visível somente para o administrador</span></div><div class="card"><small>Participações registradas</small><h2>${rows.length}</h2><span class="up">Cadastros para dar lance</span></div></div>${cards}`;
  }
  if(typeof pages!=='undefined')pages.registrations=[registrations,'Cadastros para lance','Participantes cadastrados por leilão'];
})();