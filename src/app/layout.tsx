import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter, to match the design — the reference implementation pulls it from Google
 * Fonts. Served through `next/font` instead, which self-hosts the files and so
 * avoids the render-blocking third-party request and the layout shift with it.
 */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/** `NEXT_PUBLIC_APP_NAME` is a display string only — it is safe to expose. */
const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "GovCon CRM";

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description: "Internal government contracting opportunity intelligence and CRM platform.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
