import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Plumarc",
  description: "Company knowledge, limited to what your role is allowed to see",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", figtree.variable)}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
