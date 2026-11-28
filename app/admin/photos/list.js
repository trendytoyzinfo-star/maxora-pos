// Every place that remembers a store photo.
export const PLACES = [['product_images', 'storage_path'], ['order_items', 'image_path'], ['categories', 'image_path'], ['banners', 'image_path'], ['store_settings', 'favicon_path']];
// The photos that are still on Supabase (anything that is not a full https address).
export async function oldPhotos(db) {
  const found = new Set();
  for (const [table, col] of PLACES) {
    const { data, error } = await db.from(table).select(col).not(col, 'is', null).not(col, 'like', 'http%').limit(1000);
    if (error) throw new Error(error.message);
    for (const row of data || []) if (row[col]) found.add(row[col]);
  }
  return [...found];
}
