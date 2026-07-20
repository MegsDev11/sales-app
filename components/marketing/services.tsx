import Image from "next/image";

const services = [
  {
    title: "Wireless Solutions",
    image: "/services/wireless.jpg",
    alt: "Wireless transmission tower delivering connectivity across the Waterberg",
  },
  {
    title: "Fibre Solutions",
    image: "/services/fibre.jpg",
    alt: "High-speed fibre optic connectivity",
  },
  {
    title: "Voip Solutions",
    image: "/services/voip.jpg",
    alt: "Business VoIP phone systems for modern communications",
  },
  {
    title: "CCTV Solutions",
    image: "/services/cctv.jpg",
    alt: "Professional CCTV and security camera installations",
  },
  {
    title: "Networking Solutions",
    image: "/services/networking.jpg",
    alt: "Enterprise networking and server infrastructure",
  },
];

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
          {services.map((service) => (
            <article
              key={service.title}
              className="group relative aspect-[3/5] w-[42vw] shrink-0 overflow-hidden rounded-[2rem] sm:w-[28vw] lg:w-auto"
            >
              <Image
                src={service.image}
                alt={service.alt}
                fill
                quality={92}
                sizes="(max-width: 1024px) 42vw, 20vw"
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <h3 className="absolute inset-x-0 bottom-0 px-4 pb-6 text-center text-base font-bold leading-tight text-white sm:text-lg">
                {service.title}
              </h3>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
