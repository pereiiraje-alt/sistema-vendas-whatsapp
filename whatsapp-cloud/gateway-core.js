import crypto from 'node:crypto';

export function hashToken(token){
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function deriveKey(secret){
  if(!secret || String(secret).length < 32) throw new Error('GATEWAY_SECRET deve ter pelo menos 32 caracteres');
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encryptToken(token,secret){
  const key=deriveKey(secret);
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(String(token),'utf8'),cipher.final()]);
  return {
    v:1,
    iv:iv.toString('base64'),
    tag:cipher.getAuthTag().toString('base64'),
    data:encrypted.toString('base64')
  };
}

export function decryptToken(payload,secret){
  if(!payload || payload.v!==1) throw new Error('Token persistido inválido');
  const key=deriveKey(secret);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(payload.iv,'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data,'base64')),
    decipher.final()
  ]).toString('utf8');
}

export function parseOrigins(raw=''){
  return new Set(String(raw).split(',').map(x=>x.trim()).filter(Boolean));
}

export function isAllowedOrigin(origin,allowed){
  if(!origin) return true;
  return allowed.has(origin);
}
