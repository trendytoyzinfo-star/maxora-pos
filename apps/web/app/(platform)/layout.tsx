import type { Metadata } from "next";
import "./platform.css";

export const metadata: Metadata = {
  title: "Maxora Platform",
  description: "Super Admin portal",
};

/**
 * Platform shell layout — dark, no sidebar, no restaurant chrome.
 * Wraps all /platform/* routes.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <div className="platform-shell">{children}</div>;
}
