import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

export const metadata = {
  title: "Hindsight",
  description: "A prediction market that remembers who was right. Picks settle in SUI; every call, result and lesson lives on Walrus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
