import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { teamProfiles } from "@/lib/marketing/team-content";

export function SalesTeam() {
  return (
    <section id="team" className="bg-gray-50 py-20">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Our Sales Team</h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
            Our knowledgeable, experienced sales team is ready to answer any questions and assist you in making
            the perfect choice for your needs.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {teamProfiles.map((member) => (
            <Link key={member.slug} href={`/team/${member.slug}`} className="group block">
              <Card className="overflow-hidden border-0 text-center shadow-md transition-shadow group-hover:shadow-lg">
                <div className="relative mx-auto mt-6 h-32 w-32 overflow-hidden rounded-full ring-2 ring-[#C83733]/20 transition-all group-hover:ring-[#C83733]/40">
                  <Image
                    src={member.photo}
                    alt={member.name}
                    fill
                    className="object-cover object-top"
                    sizes="128px"
                  />
                </div>
                <CardContent className="p-6 pt-4">
                  <h3 className="font-semibold text-gray-900 group-hover:text-[#C83733]">{member.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{member.role}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
