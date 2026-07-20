import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t bg-gray-900 text-gray-300">
      <div className="mx-auto max-w-6xl px-4 py-12 lg:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-white">MEGS Waterberg</p>
            <p className="mt-2 text-sm">Connecting you to the World</p>
          </div>
          <div>
            <p className="font-semibold text-white">Contact</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>Tel: <a href="tel:0878205290" className="hover:text-white">087 820 5290</a></li>
              <li><a href="mailto:sales@megswb.co.za" className="hover:text-white">sales@megswb.co.za</a></li>
              <li><a href="mailto:info@megswb.co.za" className="hover:text-white">info@megswb.co.za</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Support</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="tel:0716687882" className="hover:text-white">071 668 7882</a></li>
              <li><a href="mailto:support@megswb.co.za" className="hover:text-white">support@megswb.co.za</a></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Opening Hours</p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Mon–Fri: 07:00 – 17:00</li>
              <li>Saturday: 08:00 – 12:00</li>
              <li>Sunday &amp; Public Holidays: Closed</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-gray-800 pt-8 sm:flex-row">
          <p className="text-xs text-gray-500">
            20 Dirk van den Berg, Modimolle / Nylstroom, South Africa
          </p>
          <Link href="/login" className="text-xs text-gray-400 hover:text-white">
            Staff Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
