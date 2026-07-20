import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone, Radio, Shield, Wifi, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const services = [
  { label: "Fibre", href: "/services/fibre" },
  { label: "Wireless", href: "/services/wireless" },
  { label: "VoIP", href: "/services/voip" },
  { label: "CCTV", href: "/services/cctv" },
  { label: "Networking", href: "/services/networking" },
];

const highlights = [
  { icon: Zap, label: "21+ years", detail: "Serving Waterberg" },
  { icon: Radio, label: "Local ISP", detail: "Modimolle based" },
  { icon: Shield, label: "24/7 support", detail: "Always on call" },
];

export function Hero() {
  return (
    <section id="home" className="relative overflow-x-hidden bg-[#0b1220] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(200,55,51,0.22),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
      <div className="absolute -right-24 top-20 h-72 w-72 rounded-full bg-[#C83733]/20 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-20 lg:px-6 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="font-medium text-white/90">Limpopo&apos;s trusted connectivity partner</span>
            </div>

            <p className="mt-6 text-sm font-semibold uppercase tracking-[0.25em] text-[#C83733]">
              Megs Waterberg
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Connecting you to the{" "}
              <span className="bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
                world
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              Fibre, wireless, VoIP, CCTV and networking — built for homes and businesses across the
              Waterberg. Fast installs, local support, and over 21 years keeping Limpopo online.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {services.map((service) => (
                <Link
                  key={service.href}
                  href={service.href}
                  className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-[#C83733]/40 hover:bg-[#C83733]/10 hover:text-white"
                >
                  {service.label}
                </Link>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <a href="#contact">
                <Button size="lg" className="bg-[#C83733] px-6 hover:bg-[#a82f2b]">
                  Request a Quote
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a href="tel:0878205290">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white hover:text-gray-900"
                >
                  <Phone className="mr-2 h-5 w-5" />
                  087 820 5290
                </Button>
              </a>
            </div>

            <dl className="mt-12 grid gap-4 sm:grid-cols-3">
              {highlights.map(({ icon: Icon, label, detail }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
                >
                  <Icon className="h-5 w-5 text-[#C83733]" aria-hidden="true" />
                  <dt className="mt-3 text-sm font-semibold text-white">{label}</dt>
                  <dd className="mt-1 text-sm text-slate-400">{detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-[30.8rem] origin-center scale-[1.1] lg:max-w-none">
            <div className="relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-white/5 p-3.5 shadow-2xl shadow-black/30 backdrop-blur-sm">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.65rem]">
                <Image
                  src="/hero/connectivity.jpg"
                  alt="Connected cityscape with network coverage across the Waterberg"
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 528px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/20 to-transparent" />

                <div className="absolute inset-x-5 top-5 rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium">Network status</span>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                      Online
                    </span>
                  </div>
                  <div className="mt-4 flex items-end gap-1.5">
                    {[38, 52, 44, 68, 82, 74, 90, 64].map((height, i) => (
                      <span
                        key={i}
                        className="w-2 rounded-full bg-gradient-to-t from-[#C83733] to-orange-300"
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-300">High-speed connectivity across Modimolle &amp; surrounds</p>
                </div>

                <div className="absolute inset-x-5 bottom-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
                    <p className="text-2xl font-bold text-white">3600+</p>
                    <p className="mt-1 text-xs text-slate-300">Clients connected</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
                    <p className="text-2xl font-bold text-white">5</p>
                    <p className="mt-1 text-xs text-slate-300">Core service areas</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -right-3 -top-3 hidden rounded-2xl border border-white/10 bg-[#C83733] px-4 py-3 text-sm font-semibold shadow-lg lg:block">
              Fibre · Wireless · VoIP
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
