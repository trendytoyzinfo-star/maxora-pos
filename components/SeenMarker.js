'use client';
import { useEffect } from 'react';
import { markSeen } from '@/app/admin/actions';
// Marks the listed orders / returns as seen once the admin has the page open, then refreshes the numbers in the menu.
export default function SeenMarker({ kind, ids }) {
  const key = (ids || []).join(',');
  useEffect(() => {
    if (!key) return;
    markSeen(kind, key.split(',')).then(() => window.dispatchEvent(new Event('tt-seen'))).catch(() => {});
  }, [kind, key]);
  return null;
}
