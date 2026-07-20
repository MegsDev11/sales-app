export interface ServicePageContent {
  slug: string;
  title: string;
  headline: string;
  description: string;
  image: string;
  areas?: string[];
  areasNote?: string;
  features?: { title: string; items: string[] }[];
  featureList?: string[];
}

export const servicePages: ServicePageContent[] = [
  {
    slug: "wireless",
    title: "Wireless Solutions",
    headline: "Wireless Internet Solutions",
    description:
      "Wireless internet is an internet service that allows subscribers to connect to the internet at designated hot spots or access points using a wireless connection such as Wi-Fi (Wireless Fidelity). This is used most commonly to connect users to the internet in remote or rural areas where no other internet services like ADSL or Fibre internet is available.",
    image: "/services/wireless.jpg",
    areasNote:
      "The listed areas are some of our main town areas. We are also able to assist in the surrounding areas — send us your location so we can connect you to the world.",
    areas: [
      "Modimolle",
      "Bela-Bela",
      "Naboom",
      "Settlers",
      "Pienaars Rivier",
      "Rust de Winter",
      "Alma",
      "Melkrivier",
      "Ellisras",
      "Vaalwater",
      "Overyssel",
      "Marken",
    ],
  },
  {
    slug: "fibre",
    title: "Fibre Solutions",
    headline: "Fibre Internet Solutions",
    description:
      "Fibre, also known as fibre optic technology, refers to a high-speed internet connection that uses thin strands of glass fibres to transmit data. It is a modern and efficient method of delivering internet connectivity with faster speeds and greater reliability compared to traditional copper-based connections.",
    image: "/services/fibre.jpg",
    areas: ["Modimolle", "Kokanje", "Bosveldsig", "Die Oog"],
  },
  {
    slug: "voip",
    title: "Voip Solutions",
    headline: "What is VoIP?",
    description:
      'VOIP stands for "Voice over Internet Protocol," and it refers to a technology that allows you to make phone calls over the internet instead of using traditional telephone lines. It converts analog voice signals into digital data that can be transmitted over the internet, enabling voice communication through internet-connected devices like computers, smartphones, or dedicated VOIP phones.',
    image: "/services/voip.jpg",
    featureList: [
      "Onsite PABX",
      "Hosted PABX",
      "VoIP Lines",
      "Digital Handsets",
      "Cordless Handsets",
      "VoIP Management Software",
    ],
  },
  {
    slug: "cctv",
    title: "CCTV Solutions",
    headline: "CCTV Solutions",
    description:
      'CCTV stands for "Closed-Circuit Television," and it\'s a system that uses cameras to capture video footage and then displays or records that footage on a closed, private network.',
    image: "/services/cctv.jpg",
    featureList: [
      "NVR — Network Video Recorder",
      "DVR — Digital Video Recorder",
      "IP & Analog Cameras",
      "PTZ IP Cameras",
      "LPR Cameras",
      "Camera Gantry",
    ],
  },
  {
    slug: "networking",
    title: "Networking Solutions",
    headline: "Other Services",
    description:
      "Our other services are designed to help you get the most out of your internet experience. With our competitively priced plans, you can rest assured that you are getting the best value for your money. Our team is always available to answer any questions and help you find the best plan for your needs.",
    image: "/services/networking.jpg",
    features: [
      {
        title: "Networking",
        items: [
          "Wireless Communications",
          "Structured Cabling",
          "Network — LAN and WAN",
          "Voice over IP",
          "Least cost routing",
          "Internet bandwidth management",
          "Virtual Private Networks",
          "Radius AAA Solutions",
          "ISP Data and Voice Billing solutions",
        ],
      },
      {
        title: "Distributed Satellite and Video",
        items: ["Video on demand"],
      },
      {
        title: "Internet Access and Bandwidth",
        items: [
          "Affordable bandwidth access technology solutions",
          "Optical fibre, copper or wireless connectivity for SMBs",
          "Mailbox domains and e-mail management",
          "Daily bandwidth usage statistics and monitoring",
        ],
      },
      {
        title: "Hosting Services",
        items: [
          "Application, mail and web server hosting",
          "Solutions to establish a strong online presence",
        ],
      },
      {
        title: "Telecommunications",
        items: [
          "Digital electronic and transmission systems for voice, video and data",
          "IP PBXs and IP Telephony using SIP",
          "Routers, voice gateways, servers, Asterisk equipment and VoIP handsets",
        ],
      },
      {
        title: "Infrastructure Management",
        items: [
          "Operating systems, servers, storage, networks and middleware",
          "System performance and availability management",
          "Mutually beneficial Service Level Agreements (SLAs)",
        ],
      },
    ],
  },
];

export function getServiceBySlug(slug: string): ServicePageContent | undefined {
  return servicePages.find((s) => s.slug === slug);
}

export const serviceSlugs = servicePages.map((s) => s.slug);
