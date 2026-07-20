import Link from "next/link";
import Image from "next/image";
import { servicePages } from "@/lib/marketing/services-content";

const homeServices = servicePages.map((s) => ({
  title: s.title,
  href: `/services/${s.slug}`,
  image: s.image,
  alt: s.title,
}));

export function Services() {
  return (
    <section id="services" className="bg-white py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Explore our Services</h2>
          <p className="mt-2 text-muted-foreground">
            Practical, cost-effective technology solutions for every client
          </p>
        </div>

        <div className="mt-10 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 lg:grid lg:grid-cols-5 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
          {homeServices.map((service) => (
            <Link
              key={service.title}
              href={service.href}
              aria-label={`Learn more about ${service.title}`}
              className="group relative aspect-[3/5] w-[42vw] shrink-0 overflow-hidden rounded-[2rem] sm:w-[28vw] lg:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C83733] focus-visible:ring-offset-2"
            >
              <Image
                src={service.image}
                alt={service.alt}
                fill
                quality={92}
                sizes="(max-width: 1024px) 42vw, 20vw"
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent transition-colors group-hover:from-black/80" />
              <h3 className="absolute inset-x-0 bottom-0 px-4 pb-6 text-center text-base font-bold leading-tight text-white sm:text-lg">
                {service.title}
              </h3>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
