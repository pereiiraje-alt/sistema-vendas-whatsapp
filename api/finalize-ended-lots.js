const {serviceFetch}=require('../lib/mercadopago');

module.exports=async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Método não permitido.'});
  }

  const secret=process.env.CRON_SECRET;
  const auth=String(req.headers.authorization||'');
  if(!secret||auth!==`Bearer ${secret}`){
    return res.status(401).json({error:'Não autorizado.'});
  }

  try{
    const due=await serviceFetch(
      '/rest/v1/lots?status=eq.live&ends_at=lt.'+
      encodeURIComponent(new Date().toISOString())+
      '&select=id,auction_id&order=ends_at.asc&limit=100'
    );
    const rows=Array.isArray(due)?due:[];
    const result={checked:rows.length,finalized:0,failed:0,errors:[]};

    for(const lot of rows){
      try{
        await serviceFetch('/rest/v1/rpc/finalize_lot',{
          method:'POST',
          body:JSON.stringify({p_lot_id:lot.id})
        });
        result.finalized++;
      }catch(error){
        result.failed++;
        result.errors.push({lotId:lot.id,error:String(error.message||error).slice(0,300)});
      }
    }

    const liveAuctions=await serviceFetch(
      '/rest/v1/auctions?status=eq.live&ends_at=lt.'+
      encodeURIComponent(new Date().toISOString())+
      '&select=id&limit=100'
    );
    for(const auction of Array.isArray(liveAuctions)?liveAuctions:[]){
      const openLots=await serviceFetch(
        '/rest/v1/lots?auction_id=eq.'+encodeURIComponent(auction.id)+
        '&status=in.(draft,scheduled,live)&select=id&limit=1'
      );
      if(!Array.isArray(openLots)||!openLots.length){
        await serviceFetch('/rest/v1/auctions?id=eq.'+encodeURIComponent(auction.id),{
          method:'PATCH',
          headers:{Prefer:'return=minimal'},
          body:JSON.stringify({status:'ended',updated_at:new Date().toISOString()})
        });
      }
    }

    return res.status(200).json(result);
  }catch(error){
    console.error('finalize-ended-lots',error);
    return res.status(500).json({error:error.message||'Falha ao finalizar produtos encerrados.'});
  }
};
