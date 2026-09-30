// Gestão adicional de empresas: exclusão segura por arquivamento.
(function(){
  const baseCompanies=companies;
  const baseOverview=overview;

  async function archiveCompany(companyId,companyName){
    if(!companyId)return alert('Empresa inválida.');
    const label=companyName||'esta empresa';
    if(!confirm(`Excluir ${label}?\n\nA empresa sairá da lista e o acesso será bloqueado. Os dados ficarão preservados no sistema para segurança e histórico.`))return;

    const button=document.querySelector(`.archiveCompany[data-id="${CSS.escape(companyId)}"]`);
    if(button){button.disabled=true;button.textContent='Excluindo...';}
    try{
      const {data:members,error:memberError}=await db.from('company_members').select('role').eq('company_id',companyId);
      if(memberError)throw memberError;
      if((members||[]).some(x=>x.role==='platform_admin'))throw new Error('A empresa vinculada ao administrador da plataforma é protegida.');

      const {error}=await db.from('companies').update({
        active:false,
        subscription_status:'blocked',
        deleted_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq('id',companyId);
      if(error)throw error;

      alert('Empresa excluída da lista e acesso bloqueado com sucesso.');
      await companies();
    }catch(error){
      alert('Erro ao excluir empresa: '+(error?.message||error));
      if(button){button.disabled=false;button.textContent='Excluir';}
    }
  }

  companies=async function(showForm=false){
    await baseCompanies(showForm);

    const {data:allCompanies,error}=await db.from('companies').select('id,name,deleted_at');
    if(error)return;
    const map=new Map((allCompanies||[]).map(x=>[String(x.id),x]));
    let visible=0;

    document.querySelectorAll('.editCompany').forEach(edit=>{
      const id=String(edit.dataset.id||'');
      const company=map.get(id);
      const row=edit.closest('tr');
      if(!row)return;
      if(company?.deleted_at){row.remove();return;}
      visible++;
      if(row.querySelector('.archiveCompany'))return;

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='ghost mini archiveCompany';
      btn.dataset.id=id;
      btn.textContent='Excluir';
      btn.style.color='#b42318';
      btn.style.borderColor='#fecaca';
      btn.style.marginLeft='4px';
      btn.onclick=()=>archiveCompany(id,company?.name||row.querySelector('td b')?.textContent?.trim()||'esta empresa');
      edit.parentElement.appendChild(btn);
    });

    const countText=app.querySelector('.panel .toolbar .muted');
    if(countText)countText.textContent=`${visible} empresa(s) cadastrada(s).`;
  };

  overview=async function(){
    const [cs,as,us,bs,ps]=await Promise.all([
      db.from('companies').select('*').is('deleted_at',null).then(r=>{if(r.error)throw r.error;return r.data||[]}),
      count('auctions'),count('company_members'),count('bids'),rows('payments').catch(()=>[])
    ]);
    const active=cs.filter(x=>x.active&&x.subscription_status!=='blocked'&&x.subscription_status!=='suspended').length;
    const suspended=cs.length-active;
    const revenue=ps.reduce((s,p)=>s+(+p.amount||0),0);
    app.innerHTML=`<div class="cards"><div class="card"><small>Empresas ativas</small><h2>${active}</h2><span class="up">de ${cs.length} cadastradas</span></div><div class="card"><small>Empresas suspensas</small><h2>${suspended}</h2><span class="up">Bloqueadas ou inativas</span></div><div class="card"><small>Leilões</small><h2>${as}</h2><span class="up">Total registrado</span></div><div class="card"><small>Usuários vinculados</small><h2>${us}</h2><span class="up">Membros de empresas</span></div></div><div class="panels"><div class="panel"><h3>Administração global</h3><p>Gerencie clientes, planos, vencimentos, acessos e cobrança da plataforma.</p><button class="primary" onclick="go('companies')">Gerenciar empresas</button></div><div class="panel"><h3>Financeiro</h3><div class="row"><span>Volume registrado</span><b>${money(revenue)}</b></div><div class="row"><span>Lances</span><b>${bs}</b></div><div class="row"><span>Status do banco</span><b class="badge">Conectado</b></div></div></div>`;
  };

  if(pages?.companies)pages.companies[0]=companies;
  if(pages?.overview)pages.overview[0]=overview;
})();