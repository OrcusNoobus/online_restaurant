import Link from "next/link";

import { RESTAURANT_ADDRESS, RESTAURANT_PHONE } from "@/lib/restaurant-config";

/**
 * Preliminary text drafted by the agent, approved by the owner as interim
 * content (002 02-clarify.md Q14) — to be replaced with the lawyer-reviewed
 * version before real marketing pushes.
 */
export const metadata = { title: "Protecția datelor — Royal Food Delivery" };

const sectionTitle = "mt-6 text-base font-semibold text-zinc-900 dark:text-zinc-50";
const paragraph = "mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300";

export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold tracking-tight">Protecția datelor</h1>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Versiune preliminară — ultima actualizare: 4 iulie 2026.
        </p>

        <h2 className={sectionTitle}>1. Ce date colectăm</h2>
        <p className={paragraph}>
          La plasarea unei comenzi colectăm: nume și prenume, numărul de telefon, adresa de livrare (doar
          la livrare), adresa de e-mail (opțional), observațiile comenzii și adresa IP de la care a fost
          plasată comanda, ca măsură de prevenire a fraudelor.
        </p>

        <h2 className={sectionTitle}>2. De ce le colectăm</h2>
        <p className={paragraph}>
          Datele sunt folosite exclusiv pentru preluarea, prepararea și livrarea comenzii, pentru
          contactarea dumneavoastră în legătură cu comanda și pentru prevenirea abuzurilor. Nu trimitem
          mesaje de marketing și nu vindem datele către terți.
        </p>

        <h2 className={sectionTitle}>3. Cât timp le păstrăm</h2>
        <p className={paragraph}>
          Datele comenzilor se păstrează în evidențele noastre atât cât impun obligațiile legale și
          nevoile operaționale ale restaurantului, după care pot fi anonimizate sau șterse.
        </p>

        <h2 className={sectionTitle}>4. Conversațiile cu asistentul (chat)</h2>
        <p className={paragraph}>
          Conversațiile purtate cu asistentul de pe site se stochează pe serverele noastre (mesajele,
          coșul asociat și adresa IP, ca măsură de prevenire a abuzurilor) pentru buna funcționare a
          serviciului și pentru îmbunătățirea lui. Transcrierile se șterg automat după 30 de zile. Vă
          rugăm să nu includeți în chat date personale care nu sunt necesare comenzii.
        </p>

        <h2 className={sectionTitle}>5. Contul de client (opțional)</h2>
        <p className={paragraph}>
          Contul este opțional — puteți comanda oricând fără cont. Dacă vă creați unul, stocăm adresa de
          e-mail (identificatorul contului), parola doar sub formă criptografică ireversibilă (niciodată
          în clar) și, dacă le completați, datele profilului de livrare (nume, telefon, adresă, zonă),
          folosite exclusiv pentru precompletarea comenzilor și afișarea istoricului propriu. La
          autentificarea cu Google primim de la Google numele și adresa de e-mail verificată; nu primim
          și nu stocăm parola contului Google. Contul rămâne activ până cereți ștergerea lui.
        </p>
        <p className={paragraph}>
          La crearea contului, comenzile plasate anterior ca vizitator cu același număr de telefon sau
          aceeași adresă de e-mail se leagă automat de cont și apar în istoricul acestuia. Dacă
          preferați să nu se întâmple acest lucru, folosiți la comenzi date de contact diferite de cele
          ale contului sau cereți-ne dezlegarea lor telefonic.
        </p>

        <h2 className={sectionTitle}>6. Drepturile dumneavoastră</h2>
        <p className={paragraph}>
          Conform GDPR, aveți dreptul de acces, rectificare, ștergere, restricționare și opoziție asupra
          datelor personale — inclusiv ștergerea contului de client și exportul datelor asociate, la
          cerere. Pentru orice solicitare, contactați-ne la {RESTAURANT_PHONE} sau la restaurant:{" "}
          {RESTAURANT_ADDRESS}. Aveți de asemenea dreptul de a depune o plângere la ANSPDCP.
        </p>

        <Link href="/" className="mt-8 inline-block text-sm font-medium text-amber-700 underline dark:text-amber-400">
          Înapoi la meniu
        </Link>
      </div>
    </div>
  );
}
