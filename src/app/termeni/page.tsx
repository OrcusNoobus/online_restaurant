import Link from "next/link";

import { RESTAURANT_ADDRESS, RESTAURANT_PHONE } from "@/lib/restaurant-config";

/**
 * Preliminary text drafted by the agent, approved by the owner as interim
 * content (002 02-clarify.md Q14) — to be replaced with the lawyer-reviewed
 * version before real marketing pushes.
 */
export const metadata = { title: "Termeni și Condiții — Royal Food Delivery" };

const sectionTitle = "mt-6 text-base font-semibold text-zinc-900 dark:text-zinc-50";
const paragraph = "mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300";

export default function TermsPage() {
  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Termeni și Condiții</h1>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Versiune preliminară — ultima actualizare: 4 iulie 2026.
        </p>

        <h2 className={sectionTitle}>1. Cine suntem</h2>
        <p className={paragraph}>
          Acest site este operat de Royal Food Delivery, {RESTAURANT_ADDRESS}, telefon {RESTAURANT_PHONE}.
          Prin plasarea unei comenzi acceptați acești termeni.
        </p>

        <h2 className={sectionTitle}>2. Comenzile</h2>
        <p className={paragraph}>
          Comenzile se pot plasa zilnic între 11:00 și 22:30, cu livrare la domiciliu în localitățile
          afișate la finalizarea comenzii sau cu ridicare personală de la restaurant. Prima livrare sau
          ridicare a zilei se onorează începând cu ora 11:30. Timpul de livrare afișat este estimativ și
          poate varia în funcție de aglomerație și de distanță.
        </p>

        <h2 className={sectionTitle}>3. Prețuri și plata</h2>
        <p className={paragraph}>
          Toate prețurile sunt afișate în lei și includ TVA. Pentru băuturile în ambalaje cu garanție,
          garanția SGR de 0,50 lei/recipient se adaugă și se afișează separat; recipientul poate fi
          returnat în punctele de colectare SGR. Taxa de livrare depinde de localitate și se afișează
          înainte de plasarea comenzii; la comenzi peste pragul afișat, livrarea este gratuită. Plata se
          face la primire: numerar sau card la livrare, respectiv numerar sau card la restaurant pentru
          ridicare personală.
        </p>

        <h2 className={sectionTitle}>4. Anulări și probleme</h2>
        <p className={paragraph}>
          O comandă plasată intră imediat în preparare și nu poate fi modificată din site. Pentru anulări
          sau orice problemă cu comanda, sunați-ne cât mai repede la {RESTAURANT_PHONE}, menționând
          numărul comenzii primit la confirmare.
        </p>

        <h2 className={sectionTitle}>5. Diverse</h2>
        <p className={paragraph}>
          Ne rezervăm dreptul de a refuza comenzi abuzive sau imposibil de onorat. Imaginile produselor au
          caracter informativ. Acești termeni pot fi actualizați; versiunea curentă este cea publicată pe
          această pagină.
        </p>

        <Link href="/" className="mt-8 inline-block text-sm font-medium text-amber-700 underline dark:text-amber-400">
          Înapoi la meniu
        </Link>
      </div>
    </div>
  );
}
