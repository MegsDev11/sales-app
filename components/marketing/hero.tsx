import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section id="home" className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-[#1a1a2e] text-white">
      <div className="absolute inset-0 bg-[url('/globe.svg')] bg-center opacity-5" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 lg:px-6 lg:py-32">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-[#C83733]">Megs Waterberg</p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight lg:text-5xl">
          Connecting You to the World
        </h1>
        <p className="mt-6 max-w-xl text-lg text-gray-300">
          One of the leading experts in internet connectivity and technological services in the Limpopo area.
          Fibre, wireless, VoIP, CCTV and more — locally based in Modimolle for over 21 years.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a href="#contact">
            <Button size="lg" className="bg-[#C83733] hover:bg-[#a82f2b]">Request a Quote</Button>
          </a>
          <a href="tel:0878205290">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900">
              <Phone className="mr-2 h-5 w-5" />
              Call 087 820 5290
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
