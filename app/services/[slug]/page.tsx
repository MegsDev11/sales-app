import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ServiceDetail } from "@/components/marketing/service-detail";
import { getServiceBySlug, serviceSlugs } from "@/lib/marketing/services-content";

interface ServicePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return serviceSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) return { title: "Service | Megs Waterberg" };
  return {
    title: `${service.title} | Megs Waterberg`,
    description: service.description,
  };
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { slug } = await params;
  const service = getServiceBySlug(slug);
  if (!service) notFound();

  return <ServiceDetail service={service} />;
}
