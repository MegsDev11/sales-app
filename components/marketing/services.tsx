import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { servicePages } from "@/lib/marketing/services-content";

const homeServices = servicePages.map((s) => ({
  title: s.title,
  href: `/services/${s.slug}`,
  image: s.image,
  alt: s.title,
}));

export function Services() {
  return (
    <section id="services" className="relative overflow-hidden bg-[#0b1220] py-16 text-white lg:py-20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_20%,rgba(200,55,51,0.14),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />

      <div className="relative mx-auto max-w-6xl px-4 lg:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#C83733] sm:text-4xl">
            What we offer
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            Practical, cost-effective technology solutions for homes and businesses across the Waterberg.
          </p>
        </div>

        <div className="mt-12 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 lg:grid lg:grid-cols-5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {homeServices.map((service) => (
            <Link
              key={service.title}
              href={service.href}
              aria-label={`Learn more about ${service.title}`}
              className="group relative aspect-[3/5] w-[42vw] shrink-0 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-xl shadow-black/20 transition-colors hover:border-[#C83733]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83733] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1220] sm:w-[28vw] lg:w-auto"
            >
              <Image
                src={service.image}
                alt={service.alt}
                fill
                quality={92}
                sizes="(max-width: 1024px) 42vw, 20vw"
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/35 to-transparent transition-colors group-hover:from-[#0b1220]/95" />
              <div className="absolute inset-x-0 bottom-0 px-4 pb-5 pt-10">
                <h3 className="text-center text-base font-bold leading-tight text-white sm:text-lg">
                  {service.title}
                </h3>
                <p className="mt-2 flex items-center justify-center gap-1 text-xs font-medium text-slate-300 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5" />
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
