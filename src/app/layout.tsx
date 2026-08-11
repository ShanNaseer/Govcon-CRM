import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
