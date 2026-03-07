import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PureSapiens - AI Model Registry",
  description: "Secure decentralized platform for AI model developers",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
