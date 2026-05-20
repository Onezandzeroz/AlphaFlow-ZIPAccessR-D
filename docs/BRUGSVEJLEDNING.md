# AlphaFlow — Brugsvejledning

> Komplet brugermanual for AlphaFlow, det danskudviklede regnskabssystem til små og mellemstore virksomheder. Udviklet i overensstemmelse med dansk Bogføringslov.

---

## 1. Introduktion

### Hvad er AlphaFlow?

AlphaFlow er et moderne, cloudbaseret regnskabssystem udviklet specifikt til danske virksomheder. Systemet overholder kravene i Bogføringsloven, herunder pligten til at gemme regnskabsmateriale i mindst 5 år, samt understøttelse af SAF-T og OIOUBL formater til Erhvervsstyrelsen og Skattestyrelsen.

AlphaFlow er bygget som et multi-tenant system — det betyder, at din virksomheds data er fuldstændig adskilt fra andre kunders data, og du kun ser og har adgang til dine egne oplysninger.

### Hvem er systemet til?

| Rolle | Beskrivelse |
|-------|-------------|
| **Ejer** | Har fuld adgang til alle funktioner, herunder sletning og overdragelse af virksomhed |
| **Administrator** | Kan administrere teammedlemmer, forbinde banker og ændre indstillinger |
| **Bogholder** | Kan oprette, redigere og annullere finansposter, journalposter og fakturaer |
| **Seer** | Har skrivebeskyttet adgang til rapporter og data |
| **Revisor** | Kan eksportere rapporter og SAF-T filer til compliance |

### Hurtig oversigt over funktioner

- Standard dansk kontoplan (FSR-standard) med automatisk opsætning
- Finansielle journalposter med debet/kredit
- Fakturering med moms, kreditnotaer og OIOUBL eksport
- MOMS-register og momsopgørelse
- Bankafstemning med Open Banking og CSV-import
- Periodeafslutning og årsafslutning
- Rapportering: balance, resultatopgørelse, momsrapport
- SAF-T eksport (til Erhvervsstyrelsen/Skattestyrelsen)
- OIOUBL eksport (e-faktura i Peppol-format)
- Automatiseret backup med SHA-256 checksums
- Dokumenthåndtering og bilagsføring

---

## 2. Kom i Gang

### Oprettelse af konto og første login

1. Gå til AlphaFlows startside og klik på **Opret konto**.
2. Indtast din e-mailadresse og vælg et sikkert adgangskode.
3. Bekræft din e-mailadresse via linket i velkomstmailen.
4. Log ind med dine oplysninger.

> **Tip:** Du modtager en bekræftelsesmail inden for få minutter. Tjek dit spam-filter, hvis mailen ikke fremgår af indbakken.

### Oprettelse af virksomhed

1. Klik på **Ny virksomhed** eller gå til Indstillinger → Virksomhed.
2. Indtast følgende oplysninger:

   | Felt | Beskrivelse |
   |------|-------------|
   | Virksomhedsnavn | Det officielle navn på din virksomhed |
   | CVR-nummer | 8-cifret virksomhedsnummer |
   | Adresse | Virksomhedens fysiske adresse |
   | Telefon | Kontaktnummer |
   | E-mail | Officiel e-mailadresse |
   | Virksomhedstype | APS, A/S, ApS, IVS, Enkeltmandsvirksomhed osv. |

3. Klik på **Gem**. AlphaFlow opretter automatisk en standard dansk kontoplan.

### Inviter teammedlemmer

1. Gå til **Indstillinger → Team**.
2. Klik på **Inviter medlem**.
3. Indtast modtagerens e-mailadresse.
4. Vælg en rolle (se afsnit 13 for rollebeskrivelse).
5. Send invitationen. Modtageren modtager en mail med et tilmeldingslink.

> **Bemærk:** Kun administratorer og ejere kan invitere nye teammedlemmer.

---

## 3. Kontooversigt (Kontoplan)

### Standard dansk kontoplan

Når du opretter en virksomhed, opretter AlphaFlow automatisk en komplet kontoplan baseret på FSR-standard (Foreningen af Statsautoriserede Revisorer). Kontoplanen indeholder typisk 40+ konti fordelt på følgende hovedgrupper:

| Kontonummer | Gruppe | Eksempler |
|-------------|--------|-----------|
| 1xxx | **Aktiver** | Kasse (1000), Bankkonto (1100), Tilgodehavender (1200), Varelager (1300), IT-udstyr (1800) |
| 2xxx | **Passiv (Gæld)** | Leverandørgæld (2000), Momsgæld (2200), Personalegæld (2400), Banklån (2600) |
| 3xxx | **Egenkapital** | Aktiekapital (3000), Reserver (3200), Årets resultat (3300), Overført resultat (3400) |
| 4xxx–5xxx | **Indtægter** | Salg af varer (4000), Tjenesteydelser (4100), EU-salg (4200), Eksport (4300) |
| 6xxx–9xxx | **Omkostninger** | Vareforbrug (6000), Lønninger (7000), Husleje (8000), Renteomkostninger (9100) |

### Tilpasning af konti

**Tilføj en ny konto:**

1. Gå til **Kontoplan** i sidebjælken.
2. Klik på **Tilføj konto**.
3. Indtast kontonummer, navn og vælg type (aktiv, passiv, egenkapital, indtægt, omkostning).
4. Klik på **Gem**.

**Deaktivér en konto:**

1. Find kontoen i kontoplanen.
2. Slå aktivitetsstatus fra (toggle).
3. Kontoen forbliver synlig i historik, men kan ikke bruges til nye poster.

> **Vigtigt:** Systemkonti (markeret med ikon) kan ikke slettes. De kan kun deaktiveres.

---

## 4. Finansielle Poster (Journalposter)

### Oprettelse af journalposter

En journalpost består af mindst to linjer — en debet og en kredit — der tilsammen balancerer.

1. Gå til **Journal** i sidebjælken.
2. Klik på **Ny journalpost**.
3. Angiv dato, reference og beskrivelse.
4. Tilføj journalposter med debet og kredit:
   - Vælg konto for hver linje.
   - Angiv beløb i debet- eller kreditkolonnen.
   - Sørg for, at summen af debet = summen af kredit.
5. Klik på **Gem som kladde**.

### Bogføring af salg, køb og løn

**Salg:**
- Debet: Bankkonto (1100) eller Tilgodehavender (1200)
- Kredit: Salg af varer/tjenesteydelser (4000/4100) + Udgående moms (4510)

**Køb:**
- Debet: Vareforbrug (6000/6100) + Indgående moms (5410)
- Kredit: Bankkonto (1100) eller Leverandørgæld (2000)

**Løn:**
- Debet: Lønninger (7000)
- Kredit: Bankkonto (1100) eller Personalegæld (2400)

### Status: Kladde → Bogført

| Status | Beskrivelse |
|--------|-------------|
| **KLADDE (DRAFT)** | Posten er gemt men endnu ikke bogført. Kan redigeres og slettes. |
| **BOGFØRT (POSTED)** | Posten er endeligt bogført. Kan ikke længere redigeres. |

1. Åbn journalposten i kladdetilstand.
2. Gennemgå alle linjer.
3. Klik på **Bogfør** for at ændre status til BOGFØRT.

### Annullering af poster

I overensstemmelse med Bogføringsloven slettes poster aldrig fysisk. I stedet annulleres de (soft delete):

1. Find den bogførte post.
2. Klik på **Annuller**.
3. Angiv en årsag (f.eks. "Fejlbogføring — dobbeltkontering").
4. Systemet opretter en modpost, der neutraliserer den oprindelige post.

> **Sikkerhedsbemærkning:** Annullerede poster er altid synlige i audit-loggen med dato, bruger og årsag. Dette opfylder Bogføringslovens krav om uigendrkelig dokumentation.

### Bilagsføring

Du kan vedhæfte dokumenter (kvitteringer, fakturaer, kontrakter) til journalposter:

1. Åbn eller opret en journalpost.
2. Klik på **Upload bilag**.
3. Vælg filen fra din computer (PDF, billeder, etc.).
4. Tilføj en beskrivelse af bilaget.
5. Gem.

> **Tip:** Du kan også bruge AlphaFlows indbyggede kvitteringsscanner (OCR) til at fotografere kvitteringer med mobilen og automatisk genkende beløb, dato og butik.

---

## 5. Fakturering

### Oprettelse af salgsfaktura

1. Gå til **Fakturaer** i sidebjælken.
2. Klik på **Ny faktura**.
3. Udfyld kundeoplysninger (navn, adresse, e-mail, CVR).
4. Vælg fakturadato og forfaldsdato.
5. Tilføj linjevarer.

### Tilføjelse af linjevarer

For hver linje angives:

| Felt | Beskrivelse |
|------|-------------|
| Beskrivelse | Tekstlig beskrivelse af varen/ydelsen |
| Antal | Antal enheder |
| Enhedspris | Pris pr. enhed ekskl. moms |
| Moms | Momsats (25% standard, 12% reduceret, 0% undtaget) |
| Beløb | Beregnes automatisk (antal × enhedspris) |

Systemet beregner automatisk subtotal, momsbeløb og totalbeløb.

### Sendelse af faktura

1. Gennemgå fakturaen.
2. Klik på **Send** for at e-maile fakturaen til kunden.
3. Alternativt: Klik på **Download PDF** for at gemme og sende manuelt.

### Kreditnota

Hvis en faktura skal annulleres eller rettes:

1. Find den oprindelige faktura.
2. Klik på **Opret kreditnota**.
3. Systemet opretter en automatisk modpost med negativt beløb.
4. Angiv årsag til kreditnotaen.
5. Send kreditnotaen til kunden.

### OIOUBL Eksport

Se afsnit 11 for detaljer om eksport af e-fakturaer i OIOUBL-format.

> **Bemærk:** AlphaFlow understøtter også kreditnotaer i OIOUBL-format (InvoiceTypeCode 381). Annullerede fakturaer eksporteres automatisk som kreditnotaer.

---

## 6. MOMS (Merværdiafgift)

### Danske momssatser

| Sats | Anvendelse | Konto |
|------|------------|-------|
| **25%** | Standardmomssats for de fleste varer og tjenesteydelser | 4510 (udgående) / 5410 (indgående) |
| **12%** | Reduceret sats for bl.a. aviser, korte transportydelser | 4520 (udgående) / 5420 (indgående) |
| **0%** | Undtaget moms for bl.a. eksport, sundhedsvæsen, uddannelse | — |

### MOMS-register

AlphaFlow holder automatisk styr på din udgående og indgående moms:

- **Udgående moms (output moms):** Moms, du har opkrævet hos dine kunder og skal afregne til Skattestyrelsen.
- **Indgående moms (input moms):** Moms, du har betalt til dine leverandører og kan fratrække.

Du kan se momssaldoen under **MOMS-register** i sidebjælken.

### MOMS-opgørelse

1. Gå til **Rapporter → Momsrapport**.
2. Vælg den periode, opgørelsen skal dække (typisk et kvartal eller halvår).
3. Systemet beregner automatisk:
   - Total udgående moms
   - Total indgående moms
   - Netto moms til afregning (udgående − indgående)
4. Download rapporten som PDF eller eksporter til Excel.

> **Vigtigt:** Momsopgørelsen skal indsendes til Skattestyrelsen via TastSelv eller Virk inden fristen.

---

## 7. Bankafstemning

### Oprettelse af bankforbindelse (Open Banking)

1. Gå til **Bank** i sidebjælken.
2. Klik på **Tilføj bankforbindelse**.
3. Vælg din bank fra listen over understøttede udbydere.
4. Godkend adgangen via din banks sikkerhedssystem (NemID/MitID).
5. AlphaFlow henter automatisk transaktioner fra din bankkonto.

> **Sikkerhed:** Bankadgangskoder krypteres med AES-256-GCM og opbevares sikkert. AlphaFlow har kun læseadgang til dine kontoudtog.

### Import af kontoudtog (CSV)

1. Gå til **Bank → Import**.
2. Upload din CSV-fil fra banken.
3. Map kolonnerne (dato, tekst, beløb, saldo).
4. Klik på **Importér**.

### Automatisk afstemning

Når banktransaktioner er importeret, forsøger AlphaFlow automatisk at matche dem med eksisterende journalposter baseret på:

- Beløb
- Dato
- Beskrivelse/tekst

Matchede poster markeres automatisk som afstemt.

### Manuel afstemning

1. Gå til **Bankafstemning**.
2. Find den umatchede bankpost.
3. Klik på **Afstem manuelt**.
4. Vælg den tilhørende journalpost.
5. Bekræft afstemningen.

> **Tip:** Marker transaktioner som "ikke bogførte", hvis de endnu ikke har en tilsvarende journalpost. Du kan altid afstemme dem senere.

---

## 8. Periodeafslutning

### Åbne og lukke perioder

AlphaFlow arbejder med regnskabsperioder (måneder). En periode kan have statussen **ÅBEN** eller **LUKKET**.

1. Gå til **Regnskabsperioder** i sidebjælken.
2. Find den periode, der skal lukkes.
3. Bekræft, at alle poster for perioden er bogført.
4. Klik på **Luk periode**.

> **Bemærk:** Når en periode er lukket, kan der ikke bogføres nye poster i den. Kun administratorer kan genåbne en lukket periode.

### Årsafslutning

Årsafslutningen samler årets resultat og overfører det til egenkapitalen:

1. Sikr dig, at alle perioder for året er lukkede.
2. Gå til **Årsafslutning**.
3. Gennemgå det beregnede resultat (overskud eller underskud).
4. Klik på **Udfør årsafslutning**.

Systemet opretter automatisk en journalpost, der overfører resultatet:

- **Overskud:** Debet på konto 3300 (Årets resultat), kredit på konto 3400 (Overført resultat)
- **Underskud:** Debet på konto 3400, kredit på konto 3300

> **Vigtigt:** Årsafslutningen er en endelig handling. Kontakt din revisor, hvis du er i tvivl om proceduren.

---

## 9. Rapportering

### Balance

1. Gå til **Rapporter → Balance**.
2. Vælg periode.
3. Se en oversigt over virksomhedens aktiver, passiv og egenkapital.
4. Eksporter som PDF eller Excel.

### Resultatopgørelse

1. Gå til **Rapporter → Resultatopgørelse**.
2. Vælg periode (år eller interval).
3. Se en oversigt over årets indtægter og omkostninger med nettoresultatet.
4. Eksporter som PDF eller Excel.

### Momsrapport

Se afsnit 6 — MOMS-opgørelse.

### SAF-T Eksport

Se afsnit 10 for detaljer om eksport af SAF-T filer til Erhvervsstyrelsen.

---

## 10. SAF-T Eksport

### Hvad er SAF-T?

SAF-T (Standard Audit File for Tax) er et internationalt standardiseret filformat, som Erhvervsstyrelsen og Skattestyrelsen kan kræve udleveret ved skattekontrol. I Danmark kaldes det *SAF-T Financial DK v1.0*.

Filen indeholder en komplet kopi af dit regnskab i et maskinlæsbart XML-format, herunder:

- Kontoplan
- Momskoder og satser
- Finansposter med alle linjer
- Samlet oversigt (totals)

### Sådan eksporterer du

1. Gå til **Rapporter → Eksporter**.
2. Vælg **SAF-T eksport**.
3. Angiv periode (start- og slutdato).
4. Klik på **Generér SAF-T**.
5. Download den genererede XML-fil.

### Validering af eksport

AlphaFlow validerer automatisk filen før eksport. Valideringen tjekker bl.a.:

- Alle obligatoriske felter er udfyldt
- CVR-nummeret har korrekt format (8 cifre)
- Landekoden er sat til "DK"
- Versionen er "1.0"
- Regnskabsperioden er logisk (startdato ≤ slutdato)
- Momssatserne er gyldige danske satser (0%, 12%, 25%)

Hvis der findes fejl, vises de med forslag til rettelse. Du kan altid genkøre eksporten efter at have rettet data.

> **Tip:** Eksporter SAF-T filen regelmæssigt — f.eks. ved hvert kvartalsafslutning — så du altid har en opdateret fil klar, hvis Erhvervsstyrelsen anmoder om den.

---

## 11. OIOUBL Eksport

### Hvad er OIOUBL?

OIOUBL er den danske standard for elektroniske fakturaer (e-fakturaer). Formatet bygger på international Peppol BIS Billing 3.0 standard og bruges, når offentlige myndigheder og store virksomheder kræver elektronisk fakturering.

### Sådan eksporterer du en faktura som OIOUBL

1. Gå til **Fakturaer** og find den ønskede faktura.
2. Klik på **Eksportér OIOUBL**.
3. Systemet genererer automatisk en OIOUBL XML-fil baseret på fakturaens data.
4. Download filen og upload den til modtagerens fakturaportal.

### Understøttede Fakturatyper

AlphaFlow kan eksportere følgende fakturatyper som OIOUBL:

| Fakturakode | Type | Beskrivelse |
|-------------|------|-------------|
| 380 | Salgsfaktura | Almindelig faktura til kunde |
| 381 | Kreditnota | Tilbagebetaling eller korrektion af faktura |
| 384 | Rettet faktura | Rettelse af en eksisterende faktura |
| 389 | Selvfaktura | Selvfakturering ved leverandørfakturering |

### Validering

AlphaFlow validerer automatisk OIOUBL filen før eksport, herunder:

- Korrekt XML-struktur i henhold til Peppol BIS Billing 3.0
- Udstederoplysninger (navn, CVR, adresse)
- Modtageroplysninger
- Linjevarer med korrekte beløb og momskoder
- Totalbeløb stemmer overens med linjesum
- Momskategorier (S: Standard 25%, Z: Nulsats, E: Fritaget)

---

## 12. Backup og Gendannelse

### Automatiseret backup

AlphaFlow udfører automatisk backup af din virksomheds data med jævne mellemrum:

| Type | Hyppighed | Opbevaring |
|------|-----------|------------|
| Timebackup | Hver time | Seneste 24 |
| Dagsbackup | Hver dag | Seneste 30 |
| Ugebackup | Hver uge | Seneste 52 |
| Månedsbackup | Hver måned | Seneste 60 |

Alle backup-filer gemmes som krypterede ZIP-arkiver med tilhørende SHA-256 checksum, så du kan verificere filens integritet.

### Manuel backup

1. Gå til **Backup** i sidebjælken.
2. Klik på **Opret backup nu**.
3. Systemet opretter en manuel backup, der gemmes i 90 dage.

### Gendannelse af data

1. Gå til **Backup** og find den ønskede backup.
2. Klik på **Gendan**.
3. Bekræft handlingen.

> **Sikkerhed:** Før gendannelsen opretter systemet automatisk en sikkerhedskopi af din nuværende data. Hvis gendannelsen mislykkes, rulles ændringerne automatisk tilbage.

### 5-års opbevaringspligt

I henhold til Bogføringsloven §15 skal regnskabsmateriale opbevares i mindst 5 år. AlphaFlow opbevarer dine data sikkert i skyen og sikrer, at backup-filer opbevares med korrekte checksums til verifikation.

> **Vigtigt:** Slet aldrig gamle backup-filer manuelt. De kan være nødvendige ved skattekontrol eller revision.

---

## 13. Bruger- og Rollestyring

### 5 roller med forskellige rettigheder

| Rolle | Niveau | Kan se data | Kan oprette poster | Kan administrere | Kan slette |
|-------|--------|-------------|-------------------|-------------------|------------|
| **Ejer** | 5 (højeste) | Ja | Ja | Ja | Ja |
| **Administrator** | 4 | Ja | Ja | Ja | Nej* |
| **Bogholder** | 3 | Ja | Ja | Nej | Nej |
| **Seer** | 2 | Ja | Nej | Nej | Nej |
| **Revisor** | 1 | Ja | Nej | Nej | Nej |

\* Administratorer kan fjerne data, men kan ikke slette virksomheden eller ændre ejerskab.

### 23 tilladelser

Systemet har i alt 23 granulære tilladelser, der fordeler sig på følgende områder:

| Område | Tilladelser | Eksempler |
|--------|-------------|-----------|
| Virksomhed | 4 | Se indstillinger, redigere, overdrage, slette |
| Medlemmer | 4 | Se, invitere, fjerne, ændre rolle |
| Data | 6 | Læse, oprette, redigere, annullere, slette |
| Rapporter | 3 | Se, eksportere, SAF-T |
| Perioder | 3 | Lukke, åbne, årsafslutning |
| Bank | 2 | Forbinde, synkronisere |
| Backup | 2 | Oprette, gendanne |

### Inviterelse af nye brugere

1. Gå til **Indstillinger → Team**.
2. Klik på **Inviter medlem**.
3. Indtast e-mailadresse og vælg rolle.
4. Modtageren får en invitation pr. e-mail og skal oprette en konto.

### Virksomhedsskift

Hvis du er medlem af flere virksomheder:

1. Klik på virksomhedsnavnet øverst i venstre hjørne.
2. Vælg den ønskede virksomhed fra dropdown-menuen.
3. Alle data og menuer opdateres til den valgte virksomhed.

---

## 14. Sikkerhed

### Datakryptering

| Område | Metode |
|--------|--------|
| Bankadgangskoder | AES-256-GCM (symmetrisk kryptering) |
| Data i transit | TLS 1.3 (HTTPS) |
| Adgangskoder | bcrypt med 12 salt-runder |

### Sessionsikkerhed

- Alle sessioner er beskyttet med unikke, tilfældige sessionstokens.
- Sessioner udløber automatisk efter en vis periode.
- Systemet sporer metadata (IP-adresse, user-agent) for hver session.

### Audit trail

AlphaFlow fører en uforanderlig (immutable) audit-log over alle væsentlige handlinger:

- Oprettelse og ændring af data
- Login og logout
- Backup og gendannelse
- Rolle- og tilladelsesændringer

Audit-loggen kan ses under **Indstillinger → Audit-log** og bruges til sporing og compliance.

> **Compliance:** Audit-loggen opfylder kravene i Bogføringsloven §10 om dokumentation af regnskabsmateriale og GDPR Art. 32 om sikkerhed.

---

## 15. Support og Kontakt

### Sådan får du hjælp

- **Hjælpeside:** Klik på spørgsmålstegnet (?) i interface for at få vist kontekstafhængig hjælp.
- **Videnbase:** Besøg vores dokumentation for detaljerede guides og ofte stillede spørgsmål.
- **E-mail:** Kontakt support via e-mail for tekniske spørgsmål eller fejl.

### Fejlrapportering

Oplever du en fejl i systemet?

1. Beskriv fejlen så præcist som muligt (hvad du gjorde, hvad der skete, hvad du forventede).
2. Notér dato og klokkeslæt.
3. Tag et skærmbillede, hvis muligt.
4. Send fejlrapporten via e-mail eller supportformularen.

> **Tip:** Tjek audit-loggen under Indstillinger, hvis du har brug for at spore, hvornår en bestemt handling blev udført.

---

*AlphaFlow er udviklet med fokus på dansk compliance, brugervenlighed og sikkerhed. Alle funktioner er designet til at overholde gældende dansk lovgivning, herunder Bogføringsloven og GDPR.*
