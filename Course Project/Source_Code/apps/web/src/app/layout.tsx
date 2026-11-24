import React from "react";
import "./globals.css";
import { GlobalAppShell } from "@/components/layout/GlobalAppShell";

export const metadata = {
  title: "Online Examination System — KLE Technological University",
  description: "Institutional Deterministic Examination & Assessment Coordinator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased m-0">
        <GlobalAppShell>{children}</GlobalAppShell>
      </body>
    </html>
  );
}
