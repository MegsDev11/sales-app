export interface TeamMemberProfile {
  slug: string;
  name: string;
  firstName: string;
  role: string;
  photo: string;
  profilePhoto: string;
  bio: string;
  phone: string;
  phoneDisplay: string;
  email?: string;
  whatsapp: string;
}

export const teamProfiles: TeamMemberProfile[] = [
  {
    slug: "marlyna",
    name: "Marlyna De Villiers",
    firstName: "Marlyna",
    role: "Sales / Marketing",
    photo: "/team/marlyna.jpg",
    profilePhoto: "/team/profiles/marlyna.jpg",
    bio: "As one of the newest members of the team, I'm dedicated to offering friendly and reliable service with a personal touch. Whether you're looking for a reliable connection or just need some advice, I'm always here to help. With Megs Waterberg, you can trust that you're getting the best internet service with the best customer service.",
    phone: "27834631741",
    phoneDisplay: "083 463 1741",
    email: "account4@megswb.co.za",
    whatsapp: "27834631741",
  },
  {
    slug: "herman",
    name: "Herman Booysen",
    firstName: "Herman",
    role: "Sales Manager",
    photo: "/team/herman.jpg",
    profilePhoto: "/team/profiles/herman.jpg",
    bio: "I started at Megs 6 years ago as a junior technician and worked my way up to senior technician within a few years. Pieter noticed my relationship-building qualities at a young age and moved me to Sales to see how I would perform. My way of working with clients and after-service is one of the best in Megs Waterberg. I strive to help the people around me every day where I can.",
    phone: "27781558142",
    phoneDisplay: "078 155 8142",
    whatsapp: "27781558142",
  },
  {
    slug: "wine",
    name: "Wine Petzer",
    firstName: "Winé",
    role: "Sales Agent",
    photo: "/team/wine.jpg",
    profilePhoto: "/team/profiles/wine.jpg",
    bio: "I'm passionate about connecting with people, understanding their needs, and helping them find the right solutions. I believe great service is about more than just making a sale, it's about building genuine relationships, creating a positive experience, and making the process easy and enjoyable. I'm excited to be part of the team and look forward to helping our clients every step of the way.",
    phone: "27655092211",
    phoneDisplay: "065 509 2211",
    whatsapp: "27655092211",
  },
  {
    slug: "tenika",
    name: "Tenika Olivier",
    firstName: "Tenika",
    role: "After Sales Agent",
    photo: "/team/tenika.jpg",
    profilePhoto: "/team/profiles/tenika.jpg",
    bio: "I started at Megs Waterberg as a receptionist a little more than a year ago and have been promoted to sales agent for Megs Waterberg. My goal is to be able to make our clients happy with the best service they can get from Megs Waterberg. Pieter and Jessica are great role models and it encourages you to work harder so that one day you can get where they are. Megs Waterberg is a successful company and everyone who works here is like family.",
    phone: "27782031380",
    phoneDisplay: "078 203 1380",
    whatsapp: "27782031380",
  },
];

export const teamSlugs = teamProfiles.map((m) => m.slug);

export function getTeamMemberBySlug(slug: string): TeamMemberProfile | undefined {
  return teamProfiles.find((m) => m.slug === slug);
}
