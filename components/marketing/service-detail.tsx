import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServicePageContent } from "@/lib/marketing/services-content";

export function ServiceDetail({ service }: { service: ServicePageContent }) {
  return (
    <>
      <div className="relative h-56 overflow-hidden sm:h-72 lg:h-80">
        <Image
          src={service.image}
          alt={service.title}
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-8 lg:px-6">
          <Link
            href="/#services"
            className="mb-4 inline-flex items-center gap-1 text-sm text-white/90 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to services
          </Link>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{service.title}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold text-gray-900">{service.headline}</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{service.description}</p>
        </div>

        {service.areas && service.areas.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-900">
              Available areas for {service.slug === "fibre" ? "fibre" : "wireless"} connection
            </h2>
            {service.areasNote && (
              <p className="mt-2 max-w-3xl text-muted-foreground">{service.areasNote}</p>
            )}
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {service.areas.map((area) => (
                <li
                  key={area}
                  className="rounded-lg border bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm"
                >
                  {area}
                </li>
              ))}
            </ul>
          </section>
        )}

        {service.featureList && service.featureList.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-gray-900">
              {service.slug === "voip" ? "VoIP Solutions" : "CCTV Camera Solutions"}
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {service.featureList.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {service.features && service.features.length > 0 && (
          <section className="mt-12 space-y-10">
            {service.features.map((group) => (
              <div key={group.title}>
                <h2 className="text-xl font-bold text-gray-900">{group.title}</h2>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <section className="mt-16 rounded-2xl bg-gray-50 p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900">Request a Quote</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            Fill in the form on our contact page and our team will respond with a personalized quote
            within 24 hours. Competitive rates and excellent customer service — free, no-obligation quotes.
          </p>
          <Link href="/#contact" className="mt-6 inline-block">
            <Button size="lg" className="bg-[#C83733] hover:bg-[#a82f2b]">
              Request a Quote
            </Button>
          </Link>
        </section>
      </div>
    </>
  );
}
