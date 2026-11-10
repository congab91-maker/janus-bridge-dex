import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Janus DEX | Dual-Lane Unified AMM with Embedded Bridge Funding on Rome Protocol",
  description:
    "A unified swap pool with embedded CCTP & Wormhole bridge funding for EVM (MetaMask) and Solana (Solflare/Phantom) wallets on Rome Protocol.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#050811] text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
