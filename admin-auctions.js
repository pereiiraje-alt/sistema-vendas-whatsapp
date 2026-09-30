// Exibe o nome da empresa na visão global dos leilões do dono do sistema.
(function(){
  auctions=async function(){
    const [auctionData,companyData]=await Promise.all([
      rows('auctions'),
      rows('companies','id,name,responsible_name,email',null)
    ]);

    const companyMap=new Map(companyData.map(company=>[String(company.id),company]));

    app.innerHTML=`<div class="panel"><h3>Leilões da plataforma</h3><table><thead><tr><th>TÍTULO</th><th>STATUS</th><th>EMPRESA</th><th>INÍCIO</th><th>FIM</th></tr></thead><tbody>${auctionData.map(auction=>{
      const company=companyMap.get(String(auction.company_id));
      const companyName=company?.name||'Empresa não encontrada';
      const companyInfo=company?.responsible_name||company?.email||'';
      return `<tr><td><b>${esc(auction.title)}</b></td><td><span class="badge">${esc(auction.status)}</span></td><td><b>${esc(companyName)}</b>${companyInfo?`<br><small>${esc(companyInfo)}</small>`:''}</td><td>${date(auction.starts_at)}</td><td>${date(auction.ends_at)}</td></tr>`;
    }).join('')||'<tr><td colspan="5">Nenhum leilão.</td></tr>'}</tbody></table></div>`;
  };

  if(pages?.auctions)pages.auctions[0]=auctions;
})();