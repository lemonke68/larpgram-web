import type { MatrixClient } from 'matrix-js-sdk';

/** Import the existing account identity only. Never bootstrap or rotate keys. */
export async function verifyOwnDevice(c: MatrixClient): Promise<void> {
 const crypto = c.getCrypto();
 const userId = c.getUserId();
 const deviceId = c.getDeviceId();
 if (!crypto?.importSecretsBundle || !userId || !deviceId) throw Error('Подтверждение устройства недоступно');
 const [master_key, self_signing_key, user_signing_key] = await Promise.all([
  c.secretStorage.get('m.cross_signing.master'),
  c.secretStorage.get('m.cross_signing.self_signing'),
  c.secretStorage.get('m.cross_signing.user_signing'),
 ]);
 if (!master_key || !self_signing_key || !user_signing_key) {
  throw Error('История восстановлена, но в хранилище нет полного набора ключей подписи. Подтвердите сессию с Android.');
 }
 await crypto.getUserDeviceInfo([userId], true);
 await crypto.importSecretsBundle({cross_signing:{master_key,self_signing_key,user_signing_key}});
 await crypto.crossSignDevice(deviceId);
 const status = await crypto.getDeviceVerificationStatus(userId, deviceId);
 if (!status?.signedByOwner || !status.crossSigningVerified) {
  throw Error('История восстановлена, но подтверждение веб-устройства пока не завершено');
 }
}
