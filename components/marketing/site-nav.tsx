"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "#home", label: "Home" },
  { href: "#services", label: "Services" },
  { href: "#about", label: "About" },
  { href: "#team", label: "Our Team" },
  { href: "#contact", label: "Contact" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 lg:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-[#C83733]">MEGS</span>
          <span className="hidden text-sm font-medium text-gray-600 sm:inline">Waterberg</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-gray-700 hover:text-[#C83733]">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a href="tel:0878205290" className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-[#C83733]">
            <Phone className="h-4 w-4" />
            087 820 5290
          </a>
          <Link href="#contact">
            <Button variant="outline" size="sm" className="border-[#C83733] text-[#C83733] hover:bg-[#C83733] hover:text-white">
              Request Quote
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm" className="bg-[#C83733] hover:bg-[#a82f2b]">Staff Login</Button>
          </Link>
        </div>

        <button type="button" className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="text-sm font-medium text-gray-700" onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
            <a href="tel:0878205290" className="text-sm font-medium text-[#C83733]">087 820 5290</a>
            <Link href="#contact" onClick={() => setOpen(false)}>
              <Button variant="outline" className="w-full border-[#C83733] text-[#C83733]">Request Quote</Button>
            </Link>
            <Link href="/login" onClick={() => setOpen(false)}>
              <Button className="w-full bg-[#C83733] hover:bg-[#a82f2b]">Staff Login</Button>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
