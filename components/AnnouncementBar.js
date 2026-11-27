import Link from 'next/link';
// A thin bar at the top of the store. Text, link and on/off come from Admin -> Site.
export default function AnnouncementBar({ text, link }) {
  if (!text) return null;
  const inner = <span>{text}</span>;
  const ext = link && /^https:\/\//i.test(link);
  return <div className="annbar">{link ? (ext ? <a href={link} target="_blank" rel="noopener noreferrer">{inner}</a> : <Link href={link}>{inner}</Link>) : inner}</div>;
}
