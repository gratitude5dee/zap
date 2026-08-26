import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataPixelArc } from "@/app/_components/threeui/data-pixel-arc";
import { IntroUplinkLoader } from "@/app/_components/threeui/intro-uplink-loader";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThirdwebClientProvider } from "./ThirdwebClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Zap — composable CPU agent runtime",
    template: "%s | Zap",
  },
  description:
    "Zap composes a CPU runtime on an isolated Zap sandbox VM, renders agents as code, and plans side-effecting tools before live execution.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <IntroUplinkLoader />
        <DataPixelArc brightness={0.55} fixed />
        <ThirdwebClientProvider>
          <ConvexClientProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </ConvexClientProvider>
        </ThirdwebClientProvider>
      </body>
    </html>
  );
}
