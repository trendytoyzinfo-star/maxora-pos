'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import { imgUrl } from '@/lib/supabase';
import { cloudinaryReady, uploadToCloudinary } from '@/lib/cloudinary';
import { oldPhotos, PLACES } from './list';

// Copies a few old photos at a time (so the page never times out). The Supabase originals are NOT deleted.
export async function movePhotos() {
  await requireAdmin();
  const go = (msg, ok) => redirect(`/admin/photos?${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`);
  if (!cloudinaryReady()) return go('Add the three Cloudinary keys in Vercel first, then Redeploy.');
  const db = admin(), batch = (await oldPhotos(db)).slice(0, 5);
  let moved = 0, problem = '';
  for (const path of batch) {
    try {
      const url = await uploadToCloudinary(imgUrl(path), path.split('/')[0] || 'photos');
      for (const [table, col] of PLACES) {
        const { error } = await db.from(table).update({ [col]: url }).eq(col, path);
        if (error) throw new Error(error.message);
      }
      moved++;
    } catch (e) { problem = e.message; console.error('move photo', path, e.message); }
  }
  revalidatePath('/', 'layout');
  go(problem ? `${moved} moved. One or more failed: ${problem}` : `${moved} photo(s) moved to Cloudinary.`, !problem);
}
