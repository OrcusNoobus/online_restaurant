# Quickstart: Coș și plasare comandă

> Authored by: Agent (verified by running every flow; human can replay).
> Reads from: `01-spec.md` acceptance criteria, `06-contracts/api.md`.
> Feeds into: `harness/feature-list.json` evidence.
> Manual verification flows on a phone-sized viewport (375px). Prerequisites:
> `./init.sh` green, `npm run dev` running, shop OPEN (11:00–22:30 local).

## Flow 1 — Livrare sub prag: taxă + hint

1. Pe `/`, apasă „Adaugă" la Pizza Bambini → alege „30 cm" (Ambalajul e
   preselectat) → butonul arată „Adaugă în coș · 40,00 lei" (37 + 3 ambalaj).
2. Butonul plutitor „Coș 1" apare; deschide `/cos` → linia arată opțiunea
   Ambalaj (+3,00 lei), subtotal 40,00, notă că taxa se calculează la final.
3. „Finalizează comanda" → livrare, localitatea „Sâncraiu de Mureș", adresă,
   nume + telefon `0740123456`, bifă T&C.
4. Sumarul arată: Subtotal 40,00 · Taxă de livrare 30,00 · hint „Mai adaugă
   10,00 lei și livrarea devine gratuită." · Total 70,00.
5. „Plasează comanda" → ecran „Comanda #N a fost plasată!", estimare ~60 min,
   coșul se golește.
6. În DB: `orders` are rândul cu mode=delivery, status=new, phone=+40740123456,
   zone_id=Sâncraiu, delivery_fee_bani=3000, total_bani=7000, client_ip setat;
   `order_items` + `order_item_options` au snapshot-urile (Ambalaj 300).

**Executat 2026-07-04 → comanda #13. PASS.**

## Flow 2 — Ridicare personală cu băutură: SGR separat, fără taxă

1. Pe `/`, secțiunea Băuturi → „Adaugă" la Heineken 0,5 L → „Garanție SGR"
   e obligatorie și preselectată; preview „11,50 lei" (11,00 + 0,50 SGR).
2. `/comanda` → „Ridicare personală" (se afișează adresa restaurantului),
   estimare 25 min, plată „Card la restaurant", date client, T&C.
3. Sumar: Subtotal 11,00 · Garanție SGR 0,50 · Total 11,50 (fără taxă).
4. Plasează → confirmare „gata în ~25 minute", „Plata se face la restaurant".
5. În DB: mode=pickup, zone_id=null, address=null, estimate_minutes=25,
   payment_method=card_restaurant, sgr_bani=50, delivery_fee_bani=0.

**Executat 2026-07-04 → comanda #19. PASS.**

## Flow 3 — Livrare la/peste prag: gratuită

1. Coș cu produse de cel puțin pragul zonei (ex. Sântana de Mureș: 40 lei —
   Pizza Bambini 30 cm + ambalaj = exact 40,00).
2. La checkout cu zona Sântana de Mureș, sumarul arată „Taxă de livrare:
   gratuită", fără hint, total = subtotal + SGR.

**Verificat 2026-07-04 prin testul de integrare „applies the zone fee below
the threshold and drops it at the threshold" (exact la prag, două zone) și
prin quote-ul live din Flow 1 (sub prag). PASS.**

## Flow 4 — Programare la oră + refuzuri

1. La checkout, „La o oră anume (azi)" cu o oră validă (≥ acum + estimare,
   între 11:30 și 22:30) → comanda se plasează, confirmarea arată ora.
2. Refuzuri (acoperite de testele de integrare `npm test -- tests/orders`,
   cu ceas injectat): plasare în afara orarului (shop_closed), oră sub 11:30,
   oră pentru altă zi, metodă de plată nepotrivită modului, telefon invalid,
   adresă lipsă la livrare, coș gol, produs/topping inactiv, grup obligatoriu
   neselectat.
3. UI: în afara orarului, checkout-ul afișează bannerul „Suntem închiși" și
   butonul de trimitere e dezactivat.

**Executat 2026-07-04: programarea validă prin testul „stores a valid
scheduled time"; refuzurile prin suita de integrare (22 teste orders). PASS.**

## Flow 5 — Coșul supraviețuiește refresh-ului

1. Adaugă un produs în coș, dă refresh pe `/` → butonul „Coș" păstrează
   numărul; `/cos` re-cotează serverul și arată aceleași linii.

**Executat 2026-07-04 (localStorage `rfd-cart-v1` + re-quote la încărcare). PASS.**
