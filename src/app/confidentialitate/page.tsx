import Link from "next/link";

/** Placeholder until the owner supplies the legal text (002 02-clarify.md Q14). */
export const metadata = { title: "Protecția datelor — Royal Food Delivery" };

export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Protecția datelor</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          Datele de contact introduse la plasarea comenzii (nume, telefon, e-mail, adresă) sunt folosite
          exclusiv pentru onorarea comenzii. Adresa IP este înregistrată ca măsură de prevenire a fraudelor.
          Conținutul complet al acestei pagini va fi publicat în curând.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-amber-700 underline dark:text-amber-400">
          Înapoi la meniu
        </Link>
      </div>
    </div>
  );
}
