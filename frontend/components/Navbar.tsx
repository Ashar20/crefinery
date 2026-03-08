"use client"

import Link from "next/link"
import { CyberConnectButton } from "./CyberConnectButton"

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-[#1e1e1e]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="text-[#ededed] font-bold text-lg tracking-tight">
          PureSapiens
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/verify" className="text-sm text-[#737373] hover:text-[#ededed] transition-colors">
            Verify
          </Link>
          <Link href="/chatbot" className="text-sm text-[#737373] hover:text-[#ededed] transition-colors">
            Chat
          </Link>
          <Link href="/admin" className="text-sm text-[#737373] hover:text-[#ededed] transition-colors">
            Admin
          </Link>
          <CyberConnectButton />
        </div>
      </div>
    </nav>
  )
}
