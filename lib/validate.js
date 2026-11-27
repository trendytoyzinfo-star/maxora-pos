export const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID.test(s);
const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export function cleanPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  const t = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(t) ? t : null;
}

// Cart lines sent by the browser. Only ids and quantity are trusted; prices are always re-read from the database.
export function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) return { error: 'Your cart is empty.' };
  if (items.length > 30) return { error: 'Too many items in the cart.' };
  const out = [];
  for (const i of items) {
    const quantity = Number(i?.quantity);
    if (!isUuid(i?.product_id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return { error: 'Your cart has an invalid item. Please refresh and try again.' };
    out.push({ product_id: i.product_id.toLowerCase(), variant_id: typeof i.variant_id === 'string' ? i.variant_id.slice(0, 64) : '', quantity, free: i.free === true });
  }
  return { items: out };
}

export function cleanCustomer(b) {
  const name = str(b?.name, 80), phone = cleanPhone(b?.phone), email = str(b?.email, 120).toLowerCase();
  const line1 = str(b?.line1, 150), line2 = str(b?.line2, 150), landmark = str(b?.landmark, 100), city = str(b?.city, 60), state = str(b?.state, 60), pincode = str(b?.pincode, 6);
  if (name.length < 2) return { error: 'Please enter your full name.' };
  if (!phone) return { error: 'Please enter a valid 10-digit mobile number.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Please enter a valid email address or leave it empty.' };
  if (line1.length < 5) return { error: 'Please enter your house / street address.' };
  if (city.length < 2) return { error: 'Please enter your city.' };
  if (!STATES.includes(state)) return { error: 'Please choose your state.' };
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return { error: 'Please enter a valid 6-digit pincode.' };
  return { value: { name, phone, email, address: { full_name: name, phone, line1, line2, landmark, city, state, pincode } } };
}
