const zlib=require('zlib');

function crc32(buf){
  let c=0xffffffff;
  for(const byte of buf){
    c^=byte;
    for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function chunk(type,data=Buffer.alloc(0)){
  const t=Buffer.from(type);
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function makeIcon(size){
  size=Math.max(64,Math.min(1024,Number(size)||512));
  const raw=Buffer.alloc((size*4+1)*size);
  const bg=[11,42,32,255],white=[255,255,255,255],green=[43,208,111,255],soft=[223,248,233,255];
  for(let y=0;y<size;y++){
    const row=y*(size*4+1);raw[row]=0;
    for(let x=0;x<size;x++){
      const i=row+1+x*4;raw[i]=bg[0];raw[i+1]=bg[1];raw[i+2]=bg[2];raw[i+3]=255;
    }
  }
  const rect=(x0,y0,x1,y1,color)=>{
    x0=Math.round(x0*size);y0=Math.round(y0*size);x1=Math.round(x1*size);y1=Math.round(y1*size);
    for(let y=Math.max(0,y0);y<Math.min(size,y1);y++){
      const row=y*(size*4+1);
      for(let x=Math.max(0,x0);x<Math.min(size,x1);x++){
        const i=row+1+x*4;raw[i]=color[0];raw[i+1]=color[1];raw[i+2]=color[2];raw[i+3]=color[3];
      }
    }
  };
  // detalhe verde da marca
  rect(.12,.12,.18,.88,green);
  // J
  rect(.25,.24,.48,.32,white);
  rect(.40,.24,.48,.64,white);
  rect(.25,.58,.48,.68,white);
  rect(.22,.50,.30,.62,white);
  // P
  rect(.56,.24,.64,.68,soft);
  rect(.62,.24,.80,.32,soft);
  rect(.62,.42,.80,.50,soft);
  rect(.76,.29,.84,.45,soft);
  // assinatura inferior
  rect(.25,.76,.84,.80,green);

  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
  ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',ihdr),
    chunk('IDAT',zlib.deflateSync(raw,{level:9})),
    chunk('IEND')
  ]);
}
module.exports=(req,res)=>{
  const size=Number(req.query?.size||512);
  const allowed=[180,192,512];
  const chosen=allowed.includes(size)?size:512;
  const png=makeIcon(chosen);
  res.setHeader('Content-Type','image/png');
  res.setHeader('Cache-Control','public, max-age=86400, s-maxage=86400');
  res.status(200).send(png);
};
