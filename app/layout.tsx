import type { Metadata } from "next";
import "@fontsource-variable/figtree";
import "@fontsource/rozha-one/400.css";
import "@fontsource/hind/400.css";
import "@fontsource/hind/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shelf | Voice-first inventory",
  description: "Capture product details with your voice or a shelf photo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="relative min-h-full flex flex-col">
        <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
