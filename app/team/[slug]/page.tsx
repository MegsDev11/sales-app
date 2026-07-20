import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { TeamProfile } from "@/components/marketing/team-profile";
import { getTeamMemberBySlug, teamSlugs } from "@/lib/marketing/team-content";

interface TeamProfilePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return teamSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: TeamProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const member = getTeamMemberBySlug(slug);
  if (!member) return { title: "Team | Megs Waterberg" };
  return {
    title: `${member.name} | Megs Waterberg`,
    description: member.bio,
  };
}

export default async function TeamProfilePage({ params }: TeamProfilePageProps) {
  const { slug } = await params;
  const member = getTeamMemberBySlug(slug);
  if (!member) notFound();

  return <TeamProfile member={member} />;
}
