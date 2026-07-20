"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Home", section: "home" },
  { href: "/#network-status", label: "Status", section: "network-status" },
  { href: "/#services", label: "Services", section: "services" },
  { href: "/#about", label: "About", section: "about" },
  { href: "/#team", label: "Our Team", section: "team" },
  { href: "/#contact", label: "Contact", section: "contact" },
];

function scrollToSection(section: string) {
  if (section === "home") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.history.replaceState(null, "", "/");
    return;
  }

  const target = document.getElementById(section);
  if (target) {
    target.scrollIntoView({ behavior: "smooth" });
    window.history.replaceState(null, "", `#${section}`);
  }
}

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function handleSectionClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    section: string,
  ) {
    setOpen(false);
    if (pathname !== "/") return;

    e.preventDefault();
    scrollToSection(section);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 lg:px-6">
        <Link href="/" className="shrink-0 rounded-md bg-white/95 px-2 py-0.5">
          <Image
            src="/megs-logo.png"
            alt="MEGS Waterberg — connecting you to the world"
            width={148}
            height={36}
            priority
            className="h-8 w-auto sm:h-9"
          />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.section}
              href={link.href}
              onClick={(e) => handleSectionClick(e, link.section)}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="tel:0878205290"
            className="flex items-center gap-1 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            <Phone className="h-4 w-4" />
            087 820 5290
          </a>
          <Link
            href="/#contact"
            onClick={(e) => handleSectionClick(e, "contact")}
          >
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              Request Quote
            </Button>
          </Link>
          <Link href="/login">
            <Button size="sm" className="bg-[#C83733] hover:bg-[#a82f2b]">
              Staff Login
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="text-white md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#0b1220] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.section}
                href={link.href}
                onClick={(e) => handleSectionClick(e, link.section)}
                className="text-sm font-medium text-slate-300 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <a href="tel:0878205290" className="text-sm font-medium text-[#C83733]">
              087 820 5290
            </a>
            <Link
              href="/#contact"
              onClick={(e) => handleSectionClick(e, "contact")}
            >
              <Button
                variant="outline"
                className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                Request Quote
              </Button>
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
