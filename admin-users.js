// Gestão de usuários do painel do dono do sistema.
(function(){
  async function deletePlatformUser(userId,clientName){
    if(!userId)return alert('Usuário inválido.');
    const label=clientName||'este usuário';
    if(!confirm(`Excluir ${label}?\n\nO acesso ao sistema será removido. Os dados da empresa, leilões e histórico serão preservados.`))return;

    const button=document.querySelector(`.deleteUser[data-user-id="${CSS.escape(userId)}"]`);
    if(button){button.disabled=true;button.textContent='Excluindo...';}
    try{
      const {data:{session}}=await db.auth.getSession();
      if(!session?.access_token)throw new Error('Sessão expirada. Entre novamente.');
      const response=await fetch('/api/admin-finance-account',{
        method:'DELETE',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({userId})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Não foi possível excluir o usuário.');
      alert('Usuário excluído com sucesso.');
      await users();
    }catch(error){
      alert('Erro ao excluir usuário: '+(error?.message||error));
      if(button){button.disabled=false;button.textContent='Excluir';}
    }
  }

  users=async function(){
    const [members,companiesData]=await Promise.all([
      rows('company_members','company_id,user_id,role,created_at'),
      rows('companies','id,name,responsible_name,email',null)
    ]);
    const companyMap=new Map(companiesData.map(c=>[c.id,c]));
    app.innerHTML=`<div class="panel"><h3>Usuários e acessos</h3><table><thead><tr><th>CLIENTE</th><th>EMPRESA</th><th>E-MAIL</th><th>PERFIL</th><th>CRIADO EM</th><th>AÇÕES</th></tr></thead><tbody>${members.map(x=>{
      const company=companyMap.get(x.company_id)||{};
      const isAdmin=x.role==='platform_admin';
      const clientName=isAdmin?(sessionUser?.user_metadata?.responsible_name||sessionUser?.user_metadata?.name||'Administrador'):(company.responsible_name||company.name||'Cliente');
      const companyName=isAdmin?'JP Leilões':(company.name||'—');
      const email=isAdmin?(sessionUser?.email||company.email||'—'):(company.email||'—');
      const action=isAdmin?'<span class="muted">Protegido</span>':`<button class="ghost mini deleteUser" data-user-id="${esc(x.user_id)}" data-client="${esc(clientName)}">Excluir</button>`;
      return `<tr><td><b>${esc(clientName)}</b></td><td>${esc(companyName)}</td><td>${esc(email)}</td><td><span class="badge">${esc(x.role)}</span></td><td>${date(x.created_at)}</td><td>${action}</td></tr>`;
    }).join('')||'<tr><td colspan="6">Nenhum usuário cadastrado.</td></tr>'}</tbody></table></div>`;
    document.querySelectorAll('.deleteUser').forEach(button=>button.onclick=()=>deletePlatformUser(button.dataset.userId,button.dataset.client));
  };

  if(pages?.users)pages.users[0]=users;
})();