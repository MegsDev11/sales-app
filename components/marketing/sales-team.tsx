import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const team = [
  { name: "Marlyna De Villiers", role: "Sales / Marketing", initials: "MD" },
  { name: "Herman Booysen", role: "Sales Manager", initials: "HB" },
  { name: "Wine Petzer", role: "Sales Agent", initials: "WP" },
  { name: "Tenika Olivier", role: "After Sales Agent", initials: "TO" },
];

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
          {team.map((member) => (
            <Card key={member.name} className="border-0 text-center shadow-md">
              <CardContent className="p-6">
                <Avatar className="mx-auto h-20 w-20">
                  <AvatarFallback className="bg-[#C83733] text-lg font-semibold text-white">
                    {member.initials}
                  </AvatarFallback>
                </Avatar>
                <h3 className="mt-4 font-semibold">{member.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{member.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
