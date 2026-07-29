"use client"

import Link from "next/link"

interface LogoProps {
  size?: "sm" | "md" | "lg"
  showText?: boolean
}

export function Logo({ size = "md", showText = true }: LogoProps) {
  const sizes = {
    sm: { box: "h-7 w-7", text: "text-sm", icon: "h-3.5 w-3.5" },
    md: { box: "h-8 w-8", text: "text-base", icon: "h-4 w-4" },
    lg: { box: "h-10 w-10", text: "text-lg", icon: "h-5 w-5" },
  }

  const s = sizes[size]

  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 group">
      <div className={`${s.box} flex items-center justify-center rounded-lg bg-gradient-to-br from-[#2997ff] to-[#0066cc] text-white shadow-lg shadow-blue-500/20 transition-transform duration-300 group-hover:scale-105`}>
        <svg className={s.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`${s.text} font-semibold tracking-tight text-white`}>ATIS</span>
          <span className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground">Intelligence</span>
        </div>
      )}
    </Link>
  )
}
