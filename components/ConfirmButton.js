'use client';
// A submit button that asks "Are you sure?" first.
export default function ConfirmButton({ children, message, className = 'btn ghost', formAction }) {
  return <button type="submit" className={className} formAction={formAction} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}
