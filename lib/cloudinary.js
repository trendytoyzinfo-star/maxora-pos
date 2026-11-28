// SERVER ONLY. Store photos on Cloudinary. Keys come from Vercel: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
import { createHash, randomUUID } from 'node:crypto';
const env = () => ({ cloud: process.env.CLOUDINARY_CLOUD_NAME?.trim(), key: process.env.CLOUDINARY_API_KEY?.trim(), secret: process.env.CLOUDINARY_API_SECRET?.trim() });
export const cloudinaryReady = () => { const e = env(); return !!(e.cloud && e.key && e.secret); };

async function call(action, params, file) {
  const { cloud, key, secret } = env();
  const p = { ...params, timestamp: String(Math.floor(Date.now() / 1000)) };
  const toSign = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join('&');
  const body = new FormData();
  for (const [k, v] of Object.entries(p)) body.append(k, v);
  body.append('api_key', key);
  body.append('signature', createHash('sha1').update(toSign + secret).digest('hex'));
  if (file) body.append('file', file);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/${action}`, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary error ${res.status}`);
  return data;
}

// file: a Blob from a form, or an https address that Cloudinary downloads itself. Returns the https address of the photo.
export async function uploadToCloudinary(file, folder) {
  const data = await call('upload', { public_id: `trendytoyz/${folder}/${randomUUID()}` }, file);
  if (!data.secure_url) throw new Error('Cloudinary did not return an address');
  return data.secure_url;
}

export async function deleteFromCloudinary(url) {
  const m = String(url).match(/\/image\/upload\/(?:v\d+\/)?(trendytoyz\/.+)\.[a-z0-9]+$/i);
  if (m) await call('destroy', { public_id: m[1] });
}
