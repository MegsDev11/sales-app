import { Wifi, Cable, Phone, Camera, Network } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const services = [
  {
    icon: Wifi,
    title: "Wireless Solutions",
    description: "Reliable wireless internet for homes and businesses across the Waterberg region.",
  },
  {
    icon: Cable,
    title: "Fibre Solutions",
    description: "High-speed fibre connectivity with packages tailored to your needs.",
  },
  {
    icon: Phone,
    title: "VoIP Solutions",
    description: "Cost-effective voice over IP for modern business communications.",
  },
  {
    icon: Camera,
    title: "CCTV Solutions",
    description: "Security camera systems for residential and commercial properties.",
  },
  {
    icon: Network,
    title: "Networking Solutions",
    description: "Professional network design, installation and support.",
  },
];

export function Services() {
  return (
    <section id="services" className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Explore our Services</h2>
          <p className="mt-2 text-muted-foreground">Practical, cost-effective technology solutions for every client</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Card key={service.title} className="border-0 shadow-md transition-shadow hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#C83733]/10">
                    <Icon className="h-6 w-6 text-[#C83733]" />
                  </div>
                  <h3 className="text-lg font-semibold">{service.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{service.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
