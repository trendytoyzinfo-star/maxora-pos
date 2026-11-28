// SERVER ONLY. Saves one image and returns what to keep in the database:
// store photos go to Cloudinary (a full https address), private return proofs stay in Supabase (a path).
import { admin } from '@/lib/supabaseAdmin';
import { cloudinaryReady, uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export async function uploadImage(file, folder, bucket = 'product-images') {
  if (!file || typeof file === 'string' || !file.size) return { skip: true };
  const ext = TYPES[file.type];
  if (!ext) return { error: 'Only JPG, PNG or WebP images are allowed.' };
  if (file.size > 3 * 1024 * 1024) return { error: 'Each image must be under 3 MB.' };
  if (bucket === 'product-images' && cloudinaryReady()) {
    try { return { path: await uploadToCloudinary(file, folder) }; } catch (e) { return { error: 'Image upload to Cloudinary failed: ' + e.message }; }
  }
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await admin().storage.from(bucket).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000' });
  if (error) return { error: 'Image upload failed: ' + error.message };
  return { path };
}

// Deletes store photos wherever they are kept. A failed delete only leaves an unused file behind.
export async function removeImages(paths) {
  const old = paths.filter((p) => !/^https:/i.test(p));
  if (old.length) await admin().storage.from('product-images').remove(old);
  await Promise.all(paths.filter((p) => /^https:/i.test(p)).map((p) => deleteFromCloudinary(p).catch((e) => console.error('cloudinary delete', e.message))));
}
