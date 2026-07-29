import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { PwaRegistration } from "./pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://zap.wzrd.tech"),
  title: {
    default: "Zap — agent media runtime",
    template: "%s | Zap",
  },
  description: "Agent-first generative content recipes on Eve, Convex, Upstash, and Vercel.",
  applicationName: "WZRD",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/wzrdtechlogo.png", type: "image/png" }],
    shortcut: [{ url: "/wzrdtechlogo.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WZRD",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        <ConvexClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
