import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PureSapiens - Register Model",
  description: "Register and encrypt AI models with AES-256-GCM on EVM",
};

export default function RegisterModelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
