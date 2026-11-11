import test from 'node:test';
import assert from 'node:assert/strict';
import {hashToken,encryptToken,decryptToken,parseOrigins,isAllowedOrigin} from '../gateway-core.js';

test('hash de token é estável e não expõe token',()=>{
  const token='abc-123-super-secret';
  const hash=hashToken(token);
  assert.equal(hash,hashToken(token));
  assert.equal(hash.length,64);
  assert.equal(hash.includes(token),false);
});

test('token persiste criptografado e pode ser restaurado',()=>{
  const secret='12345678901234567890123456789012';
  const token='device-token-company-a';
  const payload=encryptToken(token,secret);
  assert.notEqual(payload.data,token);
  assert.equal(decryptToken(payload,secret),token);
  assert.throws(()=>decryptToken(payload,'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('CORS aceita apenas origens configuradas',()=>{
  const allowed=parseOrigins('https://jpleiloes.com.br, https://www.jpleiloes.com.br');
  assert.equal(isAllowedOrigin('https://jpleiloes.com.br',allowed),true);
  assert.equal(isAllowedOrigin('https://evil.example',allowed),false);
  assert.equal(isAllowedOrigin('',allowed),true);
});
