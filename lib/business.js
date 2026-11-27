// Fill these in ONCE. Policy pages and footer read from here.
// Razorpay KYC checks that these match your real business details.
export const BIZ = {
  brand: 'TrendyToyz',
  legalName: 'YOUR LEGAL / PROPRIETOR NAME',          // TODO: name on your PAN / bank account
  address: 'Bldg B3, Room No 09, Gulshan Colony, Versova, Andheri West, Mumbai - 400061',   // check: must match your Razorpay KYC
  gstin: '',                                          // TODO: leave empty if not registered
  email: 'trendytoyz.info@gmail.com',
  whatsapp: '+91 8446418374',
  hours: 'Mon–Sat, 10 AM – 7 PM IST',
  grievanceOfficer: 'YOUR NAME',                      // TODO: required under Indian e-commerce rules
  returnHours: 24,         // hours after delivery in which a return can be requested
  fromAddress: ['Bldg B3, Room No 09, Gulshan Colony', 'Versova, Andheri West', 'Mumbai - 400061'],   // printed as FROM on shipping labels
  refundDays: '5–7 working days',
  dispatchDays: '1–2 working days',
  deliveryDays: '4–8 working days',
  updated: 'November 2026',
};
export const configured = !BIZ.legalName.startsWith('YOUR') && !BIZ.address.startsWith('YOUR') && !BIZ.grievanceOfficer.startsWith('YOUR');
