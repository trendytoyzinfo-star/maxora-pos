// SERVER ONLY. Saves one image into the public "product-images" bucket and returns its path.
import { admin } from '@/lib/supabaseAdmin';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export async function uploadImage(file, folder, bucket = 'product-images') {
  if (!file || typeof file === 'string' || !file.size) return { skip: true };
  const ext = TYPES[file.type];
  if (!ext) return { error: 'Only JPG, PNG or WebP images are allowed.' };
  if (file.size > 3 * 1024 * 1024) return { error: 'Each image must be under 3 MB.' };
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin().storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000' });
  if (error) return { error: 'Image upload failed: ' + error.message };
  return { path };
}
