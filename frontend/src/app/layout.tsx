import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, VT323 } from "next/font/google";
import Providers from "./providers";
import "./globals.css";

const sans = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const display = Newsreader({
  subsets: ["latin", "vietnamese"],
  variable: "--font-display",
  weight: "400",
});

const pixel = VT323({
  subsets: ["latin", "vietnamese"],
  variable: "--font-pixel",
  weight: "400",
});

export const metadata: Metadata = {
  title: "ClinNote AI",
  description: "Trợ lý AI hỗ trợ lập bệnh án lâm sàng chuẩn SOAP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="scroll-smooth" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} ${pixel.variable} min-h-screen antialiased`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
