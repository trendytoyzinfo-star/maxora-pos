import { admin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/adminAuth';
import Flash from '@/components/Flash';
import { cloudinaryReady } from '@/lib/cloudinary';
import { movePhotos } from './actions';
import { oldPhotos } from './list';
export const maxDuration = 60;
export default async function Page({ searchParams }) {
  await requireAdmin(); const sp = await searchParams;
  const left = (await oldPhotos(admin())).length, ready = cloudinaryReady();
  return (
    <div><h1>Photos</h1><Flash sp={sp} />
      <div className="box adm-form">
        <p>{ready ? 'Cloudinary is connected. New photos are saved there.' : 'Cloudinary is NOT connected. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Vercel, then Redeploy.'}</p>
        <p><b>{left}</b> old photo(s) still on Supabase.</p>
        {ready && left > 0 && <form action={movePhotos}><button className="btn" type="submit">Move next {Math.min(left, 5)} to Cloudinary</button></form>}
        <p className="muted">Return proof photos from customers are private and stay in Supabase.</p>
      </div></div>
  );
}
