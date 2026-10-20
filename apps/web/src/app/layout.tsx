import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { Header } from "@/components/header";
import { QueryProvider } from "@/components/query-provider";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Social Media Agent",
  description: "Interne Social-Media-Content-Pipeline",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${hankenGrotesk.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-full bg-surface font-sans text-body-md text-on-surface">
        <QueryProvider>
          <Sidebar />
          <div className="pl-64">
            <Header />
            <main className="pt-16 min-h-screen bg-surface">{children}</main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
