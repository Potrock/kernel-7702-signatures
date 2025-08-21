"use client";

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PrivyProvider } from "@privy-io/react-auth";
import { base } from "viem/chains";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Create embedded wallets for users who don't have a wallet
        embeddedWallets: {
          showWalletUIs: false,
          createOnLogin: "all-users",
        },
        supportedChains: [base]
      }}
    >
        {children}
        </PrivyProvider>
      </body>
    </html>
  );
}
