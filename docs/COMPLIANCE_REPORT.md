# Intern Kontrolrapport — Compliance for Digitalt Regnskabssystem

---

## Forside

| Felt | Indhold |
|------|---------|
| **Dokumenttype** | Intern kontrolrapport / Compliance-rapport |
| **Systemnavn** | AlphaFlow (alphaflow.dk) |
| **Dokumentversion** | 1.0 |
| **Udarbejdet dato** | 2025 |
| **Gyldighedsområde** | AlphaFlow produktionsmiljø |
| **Myndighed** | Erhvervsstyrelsen (Virk.dk) |
| **Formål** | Godkendelse af digitalt regnskabssystem i henhold til Bogføringsloven |
| **Lovgrundlag** | LBK nr. 1316 af 14/08/2023, Bekendtgørelse om digitalisering af regnskabsmateriale, GDPR |
| **Systemtype** | Multi-tenant SaaS cloud regnskabssystem |
| **Sprog** | Dansk |

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Systembeskrivelse](#2-systembeskrivelse)
3. [Organisatorisk Forankring](#3-organisatorisk-forankring)
4. [Bogføringsmateriale](#4-bogføringsmateriale)
5. [Intern Kontrol](#5-intern-kontrol)
6. [Kryptering og Datasikkerhed](#6-kryptering-og-datasikkerhed)
7. [SAF-T Eksport](#7-saf-t-eksport)
8. [OIOUBL Fakturering](#8-oioubl-fakturering)
9. [Backup og Gendannelse](#9-backup-og-gendannelse)
10. [Adgangskontrol og Roller](#10-adgangskontrol-og-roller)
11. [Regnskabsperioder og Afslutning](#11-regnskabsperioder-og-afslutning)
12. [Compliance Matrix](#12-compliance-matrix)
13. [Bilag](#13-bilag)

---

## 1. Indledning

### 1.1 Formål

Nærværende intern kontrolrapport er udarbejdet med henblik på at dokumentere, at AlphaFlow (alphaflow.dk) opfylder kravene i dansk lovgivning for digitale regnskabssystemer. Rapporten udgør en del af ansøgningen til Erhvervsstyrelsen om godkendelse af AlphaFlow som digitalt regnskabssystem i henhold til Bogføringsloven.

Rapporten beskriver systemets tekniske arkitektur, organisatoriske forankring, sikkerhedsforanstaltninger, interne kontroller og compliance med gældende lovgivning.

### 1.2 Lovgrundlag

AlphaFlow er udviklet med henblik på at overholde følgende lovgivning:

| Lov / Bekendtgørelse | Relevans |
|----------------------|----------|
| **Bogføringsloven** (LBK nr. 1316 af 14/08/2023) | Primær lovgivning for regnskabspligt, dokumentationskrav, opbevaringspligt |
| **Bekendtgørelse om digitalisering af regnskabsmateriale** (Digitaliseringsbekendtgørelsen) | Krav til elektronisk regnskabsmateriale, tilgængelighed og sikkerhed |
| **EU's generelle databeskyttelsesforordning** (GDPR) | Sikkerhed for behandling af personoplysninger (artikel 32) |
| **SAF-T Financial DK v1.0** | Standardformat for udlevering af regnskabsdata til skattemyndigheder |
| **Peppol BIS Billing 3.0 / OIOUBL** | Standard for elektronisk fakturering til offentlige myndigheder |

### 1.3 Anvendelsesområde

Denne rapport dækker AlphaFlow i sin fulde produktionsudgave som multi-tenant SaaS-regnskabssystem. Rapporten beskriver:

- Systemets tekniske arkitektur og datasikkerhed
- Organisatorisk struktur og ansvarsfordeling
- Konceptet for bogføring af erhvervsmæssige transaktioner
- Interne kontroller, herunder adgangskontrol og audit trail
- Krypteringsimplementering (i hvile og i transit)
- Eksportfunktioner (SAF-T og OIOUBL)
- Backup- og gendannelsesprocedurer
- Regnskabsperiodestyring og årsafslutning
- Fuld compliance-matrix med lovgivningskrav

### 1.4 Definitioner

| Begreb | Definition |
|--------|-----------|
| **AlphaFlow** | Det digitale regnskabssystem, der er genstand for denne compliance-rapport |
| **Tenant** | En enkelt virksomhed i det multi-tenant system |
| **Multi-tenant** | Arkitektur, hvor flere virksomheder deler infrastruktur, men data er fuldstændig isoleret |
| **RBAC** | Role-Based Access Control — rollebaseret adgangskontrol |
| **Audit trail** | Uforanderlig log over alle handlinger i systemet |
| **SAF-T** | Standard Audit File for Tax — standardiseret filformat for regnskabsdata |
| **OIOUBL** | dansk XML-standard for elektronisk fakturering baseret på UBL 2.1 |

---

## 2. Systembeskrivelse

### 2.1 Overordnet Arkitektur

AlphaFlow er et moderne, cloudbaseret multi-tenant regnskabssystem udviklet i TypeScript og baseret på Next.js-frameworket. Systemet er hosted hos Neon (PostgreSQL) med Caddy som reverse proxy.

| Komponent | Teknologi | Version |
|-----------|-----------|---------|
| Frontend | Next.js med App Router | 16 |
| Sprog | TypeScript | 5 |
| ORM | Prisma | Latest |
| Database | PostgreSQL (Neon managed) | Latest stable |
| Reverse Proxy | Caddy | v2 |
| Kryptering | AES-256-GCM + TLS 1.3 | — |
| Løbetid | Node.js (Bun runtime) | Latest |

### 2.2 Multi-Tenant Arkitektur

AlphaFlow anvender virksomhedsbaseret tenant-isolering (company-based multi-tenancy). Alle data er knyttet til en virksomhed (Company) via fremmednøgler, og samtlige 89 API-ruter er scopet til virksomhedsniveau.

| Egenskab | Beskrivelse |
|----------|-------------|
| **Tenant-model** | Virksomhedsbaseret isolering via Company-model |
| **API-ruter** | 89 ruter, alle scopet per virksomhed |
| **Dataisolering** | Alle forespørgsler filtreres på companyId |
| **Identifikation** | virksomhedsspecifikke kontekst i hver session |
| **Forebyggelse af data-lækage** | Prisma tenantFilter på alle databasekald |

### 2.3 Datamodel

Systemets datamodel består af 23 Prisma-modeller organiseret omkring virksomhedens regnskabsdata:

| Kategori | Modeller |
|----------|----------|
| **Kerne** | Company, User, UserCompany, Session, Invitation |
| **Regnskab** | Transaction, Invoice, JournalEntry, JournalEntryLine |
| **Kontoplan** | Account, Contact |
| **Periode** | FiscalPeriod, Budget, BudgetEntry |
| **Bank** | BankStatement, BankStatementLine, BankConnection, BankConnectionSync |
| **Automatisering** | RecurringEntry |
| **Dokumentation** | Document |
| **System** | AuditLog, Backup, EmailLog |

Herudover definerer systemet 15 enums, herunder:

| Enum | Formål |
|------|--------|
| CompanyRole | OWNER, ADMIN, ACCOUNTANT, VIEWER, AUDITOR |
| AccountGroup | 22 kontogrupper (FSR dansk standard) |
| VATCode | 10 momskoder (S25, S12, S0, SEU, K25, K12, K0, KEU, KUF, NONE) |
| PeriodStatus | OPEN, CLOSED |
| JournalEntryStatus | DRAFT, POSTED, CANCELLED |
| InvoiceStatus | DRAFT, SENT, PAID, OVERDUE, CANCELLED |
| Permission | 23 tilladelser fordelt på 7 kategorier |
| AuditAction | 13+ begivenhedstyper |

### 2.4 Infrastruktur

| Komponent | Beskrivelse |
|-----------|-------------|
| **Produktionsdomæne** | alphaflow.dk |
| **Reverse Proxy** | Caddy v2 med automatiske Let's Encrypt-certifikater |
| **Database** | Neon Serverless PostgreSQL med `sslmode=require` |
| **Kryptering i transit** | TLS 1.3 (standard), minimum TLS 1.2 |
| **Kryptering i hvile** | AES-256-GCM for følsomme data (bank-tokens) |
| **Adgangskodehashing** | bcrypt med 12 salt-runder |
| **Sessionsikkerhed** | 32-byte kryptografisk tilfældige tokens |

### 2.5 Sikkerhedslag (Defense-in-Depth)

AlphaFlow benytter et multi-lag sikkerhedsarkitektur med fem beskyttelseslag:

| Lag | Sikkerhedsforanstaltning | Beskyttelse |
|-----|--------------------------|-------------|
| **1. Netværk** | TLS 1.3 + HSTS | Kryptering af al netværkstrafik |
| **2. Transport** | `sslmode=require` (PostgreSQL) | Krypteret databaseforbindelse |
| **3. Data** | AES-256-GCM + bcrypt | Kryptering af følsomme data og adgangskoder |
| **4. Adgangskontrol** | RBAC (5 roller, 23 tilladelser) | Granulær autorisation |
| **5. Overvågning** | Uforanderlig audit trail | Logning af alle ændringer |

---

## 3. Organisatorisk Forankring

### 3.1 Systemansvar

AlphaFlow er udviklet og drives som et software-as-a-service-produkt. Systemansvaret er forankret hos systemejeren, der har det samlede ansvar for:

- Systemets tekniske drift og vedligeholdelse
- Overholdelse af gældende lovgivning
- Sikkerhed og databeskyttelse
- Tilgængelighed og oppetid
- Backups og gendannelse

### 3.2 Brugerroller i Systemet

AlphaFlow differentierer mellem fem roller, der each tildeler specifikke rettigheder til at anvende systemets funktioner:

| Rolle | Beskrivelse | Tildeling |
|-------|-------------|-----------|
| **Ejer (OWNER)** | Fuld adgang til alle funktioner, herunder sletning og overdragelse af virksomhed | Tildelt automatisk ved oprettelse |
| **Administrator (ADMIN)** | Kan administrere teammedlemmer, forbinde banker og ændre indstillinger | Tildelt af Ejer eller Administrator |
| **Bogholder (ACCOUNTANT)** | Kan oprette, redigere og annullere finansposter, journalposter og fakturaer | Tildelt af Ejer eller Administrator |
| **Seer (VIEWER)** | Har skrivebeskyttet adgang til rapporter og data | Tildelt af Ejer eller Administrator |
| **Revisor (AUDITOR)** | Kan eksportere rapporter og SAF-T filer til compliance | Tildelt af Ejer eller Administrator |

### 3.3 Invitering og Onboarding

Nye brugere tilføjes til en virksomhed via et invitationssystem:

1. En autoriseret bruger (OWNER eller ADMIN) sender en invitation via e-mail
2. Den inviterede modtager et sikkerhedslink og opretter en konto
3. Systemet tildeler automatisk den valgte rolle
4. Alle invitationer logges i audit trail

### 3.4 Virksomhedsskift

Brugere, der er medlem af flere virksomheder, kan skifte mellem virksomhedskontekster. Ved skift opdateres alle data og menuer til den valgte virksomhed. Alle virksomhedsskift logges.

### 3.5 Tilsynsfunktion (Oversight)

Systemet tilbyder en SUPER_DEV tilsynsfunktion til teknisk support og fejlfinding:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Adgangstype** | Skrivebeskyttet læseadgang på tværs af tenants |
| **Tilladelser** | 6 specifikke læsetilladelser (ikke skrivetilladelser) |
| **Logning** | Alle tilsynshandlinger logges som OVERSIGHT-begivenheder |
| **Formål** | Teknisk support, fejlfinding, compliance-audit |

---

## 4. Bogføringsmateriale

### 4.1 Generelt

I henhold til Bogføringsloven § 1 stk. 1 skal alle erhvervsmæssige transaktioner bogføres. AlphaFlow understøtter fuld dobbelt bogføring med debet og kredit.

### 4.2 Kontoplan

AlphaFlow opretter automatisk en standard dansk kontoplan ved virksomhedsoprettelse. Kontoplanen er baseret på FSR-standard (Foreningen af Statsautoriserede Revisorer) med 22 kontogrupper og 40+ standardkonti.

| Kontonummer | Gruppe | Eksempler på konti |
|-------------|--------|-------------------|
| 1xxx | **Aktiver** | Kasse (1000), Bankkonto (1100), Tilgodehavender (1200), Varelager (1300), IT-udstyr (1800) |
| 2xxx | **Passiv** | Leverandørgæld (2000), Momsgæld (2200), Personalegæld (2400), Banklån (2600) |
| 3xxx | **Egenkapital** | Aktiekapital (3000), Reserver (3200), Årets resultat (3300), Overført resultat (3400) |
| 4xxx–5xxx | **Indtægter** | Salg af varer (4000), Tjenesteydelser (4100), EU-salg (4200), Eksport (4300) |
| 6xxx–9xxx | **Omkostninger** | Vareforbrug (6000), Lønninger (7000), Husleje (8000), Renteomkostninger (9100) |

Brugere kan tilføje, deaktivere og tilpasse konti efter behov. Systemkonti kan kun deaktiveres, ikke slettes.

### 4.3 Journalposter

Journalposter er systemets kernefunktion for bogføring af transaktioner:

**Egenskaber:**

| Egenskab | Beskrivelse |
|----------|-------------|
| **Type** | Dobbelt bogføring (debet/kredit) |
| **Linjer** | Minimum to linjer pr. post, der skal balancere |
| **Status** | DRAFT → POSTED workflow |
| **Sletning** | Soft-delete (annullering med årsag) |
| **Dokumentation** | Bilagsføring med dokumentvedhæftning |

**Statusarbejdsgang:**

| Status | Beskrivelse |
|--------|-------------|
| **KLADDE (DRAFT)** | Posten er gemt, men endnu ikke bogført. Kan redigeres og slettes. |
| **BOGFØRT (POSTED)** | Posten er endeligt bogført og kan ikke længere redigeres. |
| **ANNULLERET (CANCELLED)** | Posten er annulleret med modpost og årsagsangivelse. |

**Annullering i overensstemmelse med Bogføringsloven:**

I henhold til Bogføringslovens principper om uigendrkelig dokumentation slettes poster aldrig fysisk. I stedet annulleres de (soft-delete):

1. Brugeren klikker "Annuller" på en bogført post
2. Systemet kræver en årsagsangivelse (f.eks. "Fejlbogføring — dobbeltkontering")
3. Systemet opretter automatisk en modpost, der neutraliserer den oprindelige post
4. Annulleringen logges uforanderligt i audit trail med dato, bruger og årsag

### 4.4 Fakturering

AlphaFlow understøtter fuld fakturering med følgende funktioner:

| Funktion | Beskrivelse |
|----------|-------------|
| **Salgsfakturaer** | Fakturaer med linjevarer, momsberegning og PDF-generering |
| **Kreditnotaer** | Kreditnotaer (InvoiceTypeCode 381) med automatisk modpost |
| **Moms** | Automatisk momsberegning med 10 momskoder |
| **Eksport** | PDF-eksport og OIOUBL XML-eksport |
| **Bilagsføring** | Dokumentvedhæftning til journalposter |

### 4.5 Momssystem (Moms)

AlphaFlow implementerer et fuldt dansk momssystem med 10 momskoder:

| Momskode | Type | Sats | Beskrivelse |
|----------|------|------|-------------|
| S25 | Udgående | 25% | Standard udgående moms |
| S12 | Udgående | 12% | Reduceret udgående moms |
| S0 | Udgående | 0% | Nul udgående moms |
| SEU | Udgående | 0% | EU-leverancer (reverse charge) |
| K25 | Indgående | 25% | Standard indgående moms |
| K12 | Indgående | 12% | Reduceret indgående moms |
| K0 | Indgående | 0% | Nul indgående moms |
| KEU | Indgående | 0% | EU-indkøb (reverse charge) |
| KUF | Indgående | 0% | Udenlandsk tjenesteydelse |
| NONE | Ingen | — | Momsfri transaktion |

### 4.6 Bankafstemning

| Funktion | Beskrivelse |
|----------|-------------|
| **Open Banking** | Integration med danske bankudbydere via samtykkebaseret adgang |
| **CSV-import** | Import af kontoudtog i CSV-format |
| **Automatisk afstemning** | Matching-motor baseret på beløb, dato og tekst |
| **Manuel afstemning** | Manuel matching af bankposter med journalposter |
| **Kryptering** | Bank-tokens krypteres med AES-256-GCM før lagring |

### 4.7 Dokumenthåndtering

| Funktion | Beskrivelse |
|----------|-------------|
| **Bilagsføring** | Vedhæftning af dokumenter til journalposter |
| **Kvitteringsscanning** | OpenCV-baseret dokumentdetektion og perspektivkorrektion |
| **OCR** | Automatisk genkendelse af beløb, dato og butik fra billeder |
| **Formater** | PDF, billeder og andre dokumenttyper |

### 4.8 Gentagende Poster

AlphaFlow understøtter oprettelse af gentagende journalposter med følgende intervaller:

| Intervall | Beskrivelse |
|-----------|-------------|
| Dagligt | Gentages hver dag |
| Ugentligt | Gentages hver uge |
| Månedligt | Gentages hver måned |
| Kvartalsvis | Gentages hvert kvartal |
| Årligt | Gentages hvert år |

### 4.9 Rapportering

AlphaFlow tilbyder følgende rapporttyper:

| Rapport | Beskrivelse |
|---------|-------------|
| **Balance** | Oversigt over aktiver, passiv og egenkapital |
| **Resultatopgørelse** | Indtægter og omkostninger med nettoresultat |
| **Momsrapport** | Udgående og indgående moms pr. periode |
| **Finansrapport (General Ledger)** | Alle journalposter med detaljer |
| **Aldersfordelte rapporter (Aging)** | Tilgodehavender og forfaldne fordringer |
| **Budget vs. Faktisk** | Sammenligning af budgetterede og faktiske beløb |
| **Cash Flow** | Likviditetsudvikling |
| **Udgifter** | Kategoriseret udgiftsanalyse |
| **Økonomisk Sundhed** | Nøgletal og finansielle indikatorer |

Alle rapporter kan eksporteres som PDF eller i andre læsbare formater.

---

## 5. Intern Kontrol

### 5.1 Kontrolmiljø

AlphaFlows kontrolmiljø er bygget på følgende principper:

- **Separation of duties:** Forskellige roller har forskellige rettigheder
- **Uforanderlig dokumentation:** Alle ændringer logges uforanderligt
- **Automatiske kontroller:** Systemet udfører validering ved alle indtastninger
- **Adgangskontrol:** Granulær RBAC med 5 roller og 23 tilladelser

### 5.2 Adgangskontrol (RBAC)

Se afsnit 10 for fuld beskrivelse af rollebaseret adgangskontrol.

### 5.3 Audit Trail

AlphaFlow implementerer en uforanderlig (immutable) audit trail, der registrerer alle væsentlige handlinger i systemet.

#### 5.3.1 Uforanderlighed

- Audit-logposter kan **aldrig slettes eller ændres**
- Der findes ingen funktionalitet til redigering eller sletning af logposter
- Dette sikrer, at dokumentationen altid er fuldstændig, ægte og pålidelig

#### 5.3.2 Begivenhedstyper

Systemet definerer 13+ begivenhedstyper:

| Begivenhedstype | Beskrivelse |
|-----------------|-------------|
| `CREATE` | Oprettelse af data |
| `UPDATE` | Ændring af eksisterende data |
| `CANCEL` | Annullering (soft-delete med årsag) |
| `DELETE_ATTEMPT` | Forsøg på sletning (logges, men forhindres) |
| `LOGIN` | Succesfuld login |
| `LOGIN_FAILED` | Mislykket login |
| `LOGOUT` | Bruger logget ud |
| `REGISTER` | Ny brugeroprettelse |
| `BACKUP_CREATE` | Oprettelse af backup |
| `BACKUP_RESTORE` | Gendannelse fra backup |
| `BACKUP_DELETE` | Sletning af backup |
| `SESSION_INVALIDATE` | Tilbagekaldelse af session |
| `DATA_RESET` | Nulstilling af data |
| `OVERSIGHT` | Tilsynsfunktion anvendt |

#### 5.3.3 Entitetstyper

Audit trail dækker følgende entitetstyper:

User, Transaction, Invoice, Company, Session, Backup, Account, JournalEntry, Contact, FiscalPeriod, BankStatement, BankConnection, Document, RecurringEntry, Budget, YearEndClosing, Invitation, UserCompany, System

#### 5.3.4 Kontekstdata

Hver audit-logpost indeholder:

| Felt | Beskrivelse |
|------|-------------|
| `userId` | ID på brugeren, der udførte handlingen |
| `companyId` | Virksomhedskontekst |
| `performedByUserId` | Den faktiske udførende bruger (ved tilsyn) |
| `timestamp` | Præcist tidspunkt (ISO 8601) |
| `ipAddress` | Klientens IP-adresse |
| `userAgent` | Browser-/enhedsidentifikation |
| `before` | Tilstand før ændringen (JSON) |
| `after` | Tilstand efter ændringen (JSON) |
| `reason` | Årsag (ved annulleringer) |

### 5.4 Dataintegritet

| Kontrol | Beskrivelse |
|---------|-------------|
| **Autentificeret kryptering** | AES-256-GCM med authentication tag for integritetsverifikation |
| **Balancekontrol** | Journalposter skal balancere (debet = kredit) |
| **Uforanderlig log** | Audit trail kan ikke redigeres eller slettes |
| **Soft-delete** | Poster annulleres med modpost, ikke slettet fysisk |
| **Referentielle integritet** | Database foreign keys forhindrer orphan-data |
| **Validering** | Alle input valideres før lagring (format, længde, logik) |

### 5.5 Multi-Tenant Isolering

| Kontrol | Beskrivelse |
|---------|-------------|
| **Virksomhedsscopning** | Alle 89 API-ruter filtrerer på companyId |
| **Sessionbinding** | Hver session er bundet til en specifik virksomhed |
| **TenantFilter** | Prisma middleware filtrerer alle databasekald |
| **Adgangskontrol** | RBAC-tjek på 47 af 89 ruter |

---

## 6. Kryptering og Datasikkerhed

### 6.1 Kryptering i Hvile (At-Rest)

AlphaFlow benytter AES-256-GCM til kryptering af følsomme data (bank-adgangstokens og opdateringstokens) før lagring i databasen.

| Parameter | Værdi |
|-----------|-------|
| **Algoritme** | AES-256-GCM (Advanced Encryption Standard — Galois/Counter Mode) |
| **Nøglelængde** | 256 bit (32 bytes) |
| **IV (Initialization Vector)** | 96 bit (12 bytes) — tilfældig ved hver kryptering |
| **Authentication Tag** | 128 bit (16 bytes) |
| **Nøglekilde** | Miljøvariablen `ENCRYPTION_KEY` (hex-kodet, 64 tegn) |
| **Implementering** | `src/lib/crypto.ts` (server-side kun) |

**Hvorfor AES-256-GCM?**

AES-256-GCM er en autentificeret krypteringsalgoritme (AEAD), der leverer:

1. **Fortrolighed (Confidentiality):** Data kan kun læses med den korrekte nøgle.
2. **Integritet (Integrity):** Enhver manipulation af krypteret data afsløres ved dekryptering via authentication tag.

### 6.1.1 Lagringsformat

Krypterede data lagres i PostgreSQL i følgende format:

```
iv_base64:authTag_base64:ciphertext_base64
```

| Del | Beskrivelse |
|-----|-------------|
| `iv_base64` | Initialization Vector (12 bytes, Base64-kodet) |
| `authTag_base64` | Authentication Tag (16 bytes, Base64-kodet) |
| `ciphertext_base64` | Krypteret data (variabel længde, Base64-kodet) |

### 6.1.2 IV-håndtering

- Hver krypteringsoperation genererer en **ny tilfældig IV** (12 bytes)
- IV'er **genbruges aldrig** — kritisk krav for GCM-tilstand
- IV genereres via `crypto.getRandomValues()` (CSPRNG)
- Nøglen caches i hukommelsen, men **gemmes aldrig** i database eller git

### 6.1.3 Nøglehåndtering

| Regel | Beskrivelse |
|-------|-------------|
| Kun miljøvariabel | Nøglen læses fra `process.env.ENCRYPTION_KEY` |
| Aldrig i database | Nøglen gemmes aldrig i nogen databasetabel |
| Aldrig i git | Ekskluderet via `.gitignore` |
| Kun server-side | Kun tilgængelig i server-side kode |
| Caching | Parseres én gang og caches i hukommelsen |

### 6.2 Kryptering i Transit (In-Transit)

### 6.2.1 TLS 1.3

| Parameter | Konfiguration |
|-----------|---------------|
| **Reverse Proxy** | Caddy v2 |
| **Certifikatudsteder** | Let's Encrypt (automatisk fornyelse) |
| **Produktionsdomæne** | `alphaflow.dk` |
| **Standard TLS-version** | TLS 1.3 |
| **Minimum TLS-version** | TLS 1.2 |
| **HTTP→HTTPS** | Automatisk omdirigering |

### 6.2.2 HSTS (HTTP Strict Transport Security)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

| Parameter | Værdi | Betydning |
|-----------|-------|-----------|
| `max-age` | 31536000 sekunder (1 år) | Browser tvinges til HTTPS i 1 år |
| `includeSubDomains` | Aktiveret | Gælder for alle subdomæner |
| `preload` | Aktiveret | Indsendes til browser-preload lister |

### 6.2.3 Sikkerhedshoveder

| Header | Værdi | Formål |
|--------|-------|--------|
| `X-Frame-Options` | DENY | Forhindrer clickjacking via iframe-indlejring |
| `X-Content-Type-Options` | nosniff | Forhindrer MIME-type sniffing |
| `X-XSS-Protection` | 1; mode=block | Browser-indbygget XSS-filter |
| `Referrer-Policy` | strict-origin-when-cross-origin | Begrænser referrer-information |
| `Permissions-Policy` | Kamera, mikrofon, lokation | Begrænser browser-API-adgang |

### 6.3 Adgangskodesikkerhed

| Parameter | Værdi |
|-----------|-------|
| **Algoritme** | bcrypt |
| **Salt-runder** | 12 |
| **Implementering** | `src/lib/password.ts` (bcryptjs) |
| **Lagring** | Kun hash — adgangskoden gemmes aldrig i klartekst |

**Sikkerhedsprincipper:**

- Adgangskoder transmitteres kun over krypteret forbindelse (TLS 1.3)
- Adgangskoder lagres aldrig i klartekst i databasen eller logs
- Adgangskoder logges aldrig eller vises i nogen form
- Ved login sammenlignes kun hashes

### 6.4 Sessionsikkerhed

| Egenskab | Beskrivelse |
|----------|-------------|
| **Token** | Kryptografisk tilfældig 32-byte streng |
| **Udløb** | 7 dage (sliding expiry) |
| **Binding** | IP-adresse og User-Agent tracking |
| **Tilbagekaldelse** | Umiddelbar invalidering ved logout |
| **Oprydning** | Udløbne sessions slettes automatisk |
| **Multi-session** | En bruger kan have flere aktive sessions |

### 6.5 Databaseforbindelsessikkerhed

| Parameter | Værdi |
|-----------|-------|
| **Database** | PostgreSQL (Neon managed) |
| **Forbindelsessikkerhed** | `sslmode=require` |
| **Kryptering** | TLS-krypteret forbindelse |
| **Krav** | Forbindelse afvises uden gyldigt TLS-certifikat |

Med `sslmode=require` er alle data transmitteret mellem applikation og database krypteret. Bank-tokens er dermed dobbelt krypteret: AES-256-GCM (data) + TLS (transport).

### 6.6 Sammenfatning af Datasikkerhed

```
┌─────────────────────────────────────────────────┐
│  AlphaFlow Datasikkerhed — 5 Lag               │
├─────────────────────────────────────────────────┤
│                                                  │
│  Lag 1: Netværkssikkerhed                       │
│  ├── TLS 1.3 (krypteret transit)                │
│  ├── HSTS (forhindrer downgrade)                │
│  └── Sikkerhedshoveder (X-Frame-Options mv.)    │
│                                                  │
│  Lag 2: Transportsikkerhed                      │
│  ├── sslmode=require (PostgreSQL)                │
│  └── Krypteret databaseforbindelse              │
│                                                  │
│  Lag 3: Datasikkerhed (At-Rest)                 │
│  ├── AES-256-GCM (bank-tokens, 256-bit)         │
│  └── bcrypt (adgangskoder, 12 salt-runder)      │
│                                                  │
│  Lag 4: Adgangskontrol                          │
│  ├── RBAC (5 roller, 23 tilladelser)            │
│  ├── Session-management (32-byte tokens)        │
│  └── Multi-tenant isolation                     │
│                                                  │
│  Lag 5: Overvågning                             │
│  ├── Audit trail (uforanderlig, 13+ typer)      │
│  └── Fuld kontekst (hvem/hvad/hvornår/hvorfra) │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 7. SAF-T Eksport

### 7.1 Standard og Format

| Parameter | Værdi |
|-----------|-------|
| **Format** | SAF-T Financial DK v1.0 |
| **Filformat** | XML |
| **Namespace** | `urn:Oasis/Tax/Accounting/SAF-T/Financial/DK` |
| **Karakterkodning** | UTF-8 |
| **Formål** | Udlevering af regnskabsdata til Erhvervsstyrelsen/Skattestyrelsen |

### 7.2 Indhold

SAF-T-filen indeholder følgende sektioner:

| Sektion | Indhold | Datakilde |
|---------|---------|-----------|
| **Header** | Virksomhedsoplysninger (navn, CVR, adresse), tidsperiode | Company-model |
| **MasterFiles** | | |
| ├── GeneralLedgerAccounts | Komplet kontoplan | Account-model |
| ├── TaxCodeTable | Momskoder og satser | VATCode-enum |
| └── Customers | Kundekontakter (navn, CVR, adresse) | Contact-model (reelle data) |
| **GeneralLedgerEntries** | Bogførte journalposter med linjer | JournalEntry + JournalEntryLine |
| **SourceDocuments** | Salgsfakturaer | Invoice-model |
| **Totals** | Samlet debet, kredit og moms | Beregnet fra journalposter |

### 7.3 Kundedata (ikke Pladsholdere)

AlphaFlow eksporterer reelle kundedata fra Contact-modellen i MasterFiles-sektionen:

- Kundenavn
- CVR-nummer (TaxID)
- Adresse
- Kontaktoplysninger

Systemet benytter kun minimal pladsholderdata, hvis virksomheden ikke har nogen kunder registreret. Dette sikrer, at SAF-T-filen indeholder faktiske regnskabsdata.

### 7.4 Validering

Før eksport udfører systemet 23+ valideringskontroller:

| Kontrol | Beskrivelse |
|---------|-------------|
| **Obligatoriske felter** | Virksomhedsnavn, CVR, periode mv. skal være udfyldt |
| **CVR-format** | 8-cifret dansk CVR-nummer |
| **Balanceverifikation** | Sum debet = sum kredit i Totals |
| **Datoformat** | ISO 8601 (YYYY-MM-DD) |
| **Periodelogik** | Startdato ≤ slutdato |
| **Momssatser** | Gyldige danske satser (0%, 12%, 25%) |
| **Softwareversion** | SoftwareVersion-element er til stede |
| **XML-deklaration** | XML-prolog er til stede |
| **Pladsholder-kontrol** | Advarsel ved brug af pladsholder-kunder |
| **GL-entries** | GeneralLedgerEntries-sektion findes |
| **Landekode** | "DK" for danske virksomheder |

### 7.5 Eksportprocedure

1. Brugeren vælger "SAF-T eksport" under Rapporter → Eksporter
2. Angivelse af tidsperiode (start- og slutdato)
3. Systemet genererer XML-fil med automatiske valideringer
4. Valideringsfejl vises med forslag til rettelse
5. Ved succes: Download af den komplette SAF-T XML-fil

---

## 8. OIOUBL Fakturering

### 8.1 Standard og Profil

| Parameter | Værdi |
|-----------|-------|
| **Standard** | UBL 2.1 (Universal Business Language) |
| **Profil** | Peppol BIS Billing 3.0 |
| **Profil-URI** | `urn:cen.eu:en16931:2017` |
| **Formål** | Elektronisk fakturering til offentlige myndigheder og store virksomheder |

### 8.2 Fakturatyper

| InvoiceTypeCode | Type | Beskrivelse |
|-----------------|------|-------------|
| 380 | Commercial Invoice | Almindelig salgsfaktura |
| 381 | Credit Note | Kreditnota (annullering/korrektion) |
| 384 | Corrected Invoice | Rettet faktura |
| 389 | Self-billed Invoice | Selvfakturering |

### 8.3 Momskategorier

| Kategori | Kode | Beskrivelse |
|----------|------|-------------|
| S (Standard) | Standard | Standardmomssats (25%) |
| Z (Zero rate) | Zerorated | Nulsats (0%) |
| E (Exempt) | Undtaget | Momsfritaget |

### 8.4 Valuta

| Parameter | Værdi |
|-----------|-------|
| **Standardvaluta** | DKK (danske kroner) |
| **Multi-valuta** | Understøttet med valutakurser |
| **Format** | ISO 4217 |

### 8.5 Identifikation

| Parameter | Værdi |
|-----------|-------|
| **Endpoint ID Scheme** | 0184 (dansk CVR-nummer) |
| **Udsteder-ID** | Virksomhedens CVR-nummer |
| **Modtager-ID** | Kundens CVR eller GLN |

### 8.6 Validering

Før eksport udføres automatisk validering af:

| Kontrol | Beskrivelse |
|---------|-------------|
| **XML-struktur** | Gyldig i henhold til Peppol BIS Billing 3.0 |
| **Udstederoplysninger** | Navn, CVR, adresse er korrekte |
| **Modtageroplysninger** | Navn, CVR/ID, adresse er korrekte |
| **Linjevarer** | Beløb og momskoder er korrekte |
| **Totalbeløb** | Linjesum stemmer overens med total |
| **Momsberegning** | Mombeløb er korrekt beregnet |

### 8.7 Eksportprocedure

1. Brugeren åbner den ønskede faktura
2. Klik på "Eksportér OIOUBL"
3. Systemet genererer automatisk OIOUBL XML-fil
4. Validering udføres automatisk
5. Ved succes: Download af XML-filen
6. Filen kan uploades til modtagerens fakturaportal (f.eks. Nemhandel)

---

## 9. Backup og Gendannelse

### 9.1 Backupstrategi

AlphaFlow udfører automatiserede backups af virksomhedens data med følgende retention-politik:

| Backup-type | Hyppighed | Retention (antal) | Opbevaringstid |
|-------------|-----------|-------------------|----------------|
| Timebackup | Hver time | 24 | 1 dag |
| Dagsbackup | Hver dag | 30 | 30 dage |
| Ugebackup | Hver uge | 52 | 1 år |
| Månedsbackup | Hver måned | 60 | 5 år |
| Manuel backup | Efter behov | 999 | 90 dage |

### 9.2 Backupindhold

Hver backup indeholder virksomhedens komplette regnskabsdata som JSON-filer i et ZIP-arkiv:

| Fil | Indhold |
|-----|---------|
| `manifest.json` | Backup-metadata (timestamp, version, checksums) |
| `company.json` | Virksomhedsoplysninger |
| `accounts.json` | Komplet kontoplan |
| `contacts.json` | Kunder og leverandører |
| `transactions.json` | Alle transaktioner |
| `invoices.json` | Alle fakturaer |
| `journal-entries.json` | Alle journalposter med linjer |
| `fiscal-periods.json` | Regnskabsperioder |
| `budgets.json` | Budgetter |
| `recurring-entries.json` | Gentagende poster |
| `bank-statements.json` | Kontoudtog og linjer |
| `bank-connections.json` | Bankforbindelser (uden tokens) |
| `members.json` | Medlemskaber og roller |

### 9.3 Integritetskontrol

| Kontrol | Beskrivelse |
|---------|-------------|
| **SHA-256 checksums** | Alle backup-filer forsynes med SHA-256 checksum |
| **Verifikation** | Checksum kan bruges til at verificere filens integritet |
| **Manipulationsdetektion** | Enhver ændring af backup-filen opdages ved checksum-kontrol |

### 9.4 Gendannelsesprocedure

Gendannelse af data fra backup udføres via følgende sikrede procedure:

1. Brugeren vælger en backup fra listen
2. Klik på "Gendan"
3. Systemet opretter automatisk en **præ-gendannelses sikkerhedskopi** af nuværende data
4. Data importeres via **atomiske databasetransaktioner**
5. Ved fejl: transaktionen rulles automatisk tilbage (rollback)
6. Ved succes: gendannelsen fuldføres, og den gamle data er bevaret i sikkerhedskopien

### 9.5 Audit af Backup

Alle backup-relaterede handlinger logges uforanderligt i audit trail:

| Handling | Logtype |
|----------|---------|
| Oprettelse af backup | BACKUP_CREATE |
| Gendannelse fra backup | BACKUP_RESTORE |
| Sletning af backup | BACKUP_DELETE |

### 9.6 Opbevaringspligt

I henhold med Bogføringsloven § 15 stk. 1 skal regnskabsmateriale opbevares i mindst 5 år. AlphaFlow opfylder dette krav gennem:

- **Månedsbackups med 60 måneders retention** (5 år)
- **Ugebackups med 52 ugers retention** (1 år, overlap med månedsbackups)
- **SHA-256 checksums** til verificering af dataintegritet
- **Krypteret opbevaring** (TLS 1.3 for transit, AES-256-GCM for følsomme data)

---

## 10. Adgangskontrol og Roller

### 10.1 Rollebaseret Adgangskontrol (RBAC)

AlphaFlow implementerer et omfattende rollebaseret adgangskontrolsystem med 5 roller og 23 granulære tilladelser.

### 10.2 Roller

| Rolle | Niveau | Beskrivelse |
|-------|--------|-------------|
| **OWNER** | 5 (højeste) | Fuld adgang til alle funktioner, herunder sletning og overdragelse |
| **ADMIN** | 4 | Kan administrere teammedlemmer, forbinde banker og ændre indstillinger |
| **ACCOUNTANT** | 3 | Kan oprette, redigere og annullere finansposter og fakturaer |
| **VIEWER** | 2 | Skrivebeskyttet adgang til rapporter og data |
| **AUDITOR** | 1 | Kan eksportere rapporter og SAF-T filer til compliance |

### 10.3 Tilladelser (23 i alt)

#### 10.3.1 Virksomhed (4 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `COMPANY_VIEW_SETTINGS` | Vise virksomhedsindstillinger |
| `COMPANY_EDIT_SETTINGS` | Ændre virksomhedsindstillinger |
| `COMPANY_TRANSFER_OWNERSHIP` | Overdrage ejerskab af virksomhed |
| `COMPANY_DELETE` | Slette virksomhed |

#### 10.3.2 Medlemmer (4 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `MEMBERS_VIEW` | Vise teammedlemmer |
| `MEMBERS_INVITE` | Invitere nye medlemmer |
| `MEMBERS_REMOVE` | Fjerne medlemmer |
| `MEMBERS_CHANGE_ROLE` | Ændre medlemsrolle |

#### 10.3.3 Data (5 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `DATA_READ` | Læse regnskabsdata |
| `DATA_CREATE` | Oprette nye poster |
| `DATA_EDIT` | Redigere eksisterende poster |
| `DATA_CANCEL` | Annullere poster |
| `DATA_DELETE` | Slette data |

#### 10.3.4 Rapporter (3 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `REPORTS_VIEW` | Vise rapporter |
| `REPORTS_EXPORT` | Eksportere rapporter |
| `REPORTS_SAFT` | Eksportere SAF-T filer |

#### 10.3.5 Perioder (3 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `PERIOD_CLOSE` | Lukke regnskabsperiode |
| `PERIOD_OPEN` | Genåbne regnskabsperiode |
| `YEAR_END_CLOSE` | Udføre årsafslutning |

#### 10.3.6 Bank (2 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `BANK_CONNECT` | Forbinde bankforbindelser |
| `BANK_SYNC` | Synkronisere bankdata |

#### 10.3.7 Backup (2 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `BACKUP_CREATE` | Oprette backup |
| `BACKUP_RESTORE` | Gendanne fra backup |

### 10.4 Rolle-Tilladelse Matrix

Nedenstående matrix viser, hvilke tilladelser der er tildelt hver rolle:

| Tilladelse | OWNER | ADMIN | ACCOUNTANT | VIEWER | AUDITOR |
|------------|:-----:|:-----:|:----------:|:------:|:-------:|
| COMPANY_VIEW_SETTINGS | ✅ | ✅ | ✅ | ✅ | ✅ |
| COMPANY_EDIT_SETTINGS | ✅ | ✅ | ❌ | ❌ | ❌ |
| COMPANY_TRANSFER_OWNERSHIP | ✅ | ❌ | ❌ | ❌ | ❌ |
| COMPANY_DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |
| MEMBERS_VIEW | ✅ | ✅ | ✅ | ✅ | ✅ |
| MEMBERS_INVITE | ✅ | ✅ | ❌ | ❌ | ❌ |
| MEMBERS_REMOVE | ✅ | ✅ | ❌ | ❌ | ❌ |
| MEMBERS_CHANGE_ROLE | ✅ | ✅ | ❌ | ❌ | ❌ |
| DATA_READ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DATA_CREATE | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_EDIT | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_CANCEL | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |
| REPORTS_VIEW | ✅ | ✅ | ✅ | ✅ | ✅ |
| REPORTS_EXPORT | ✅ | ✅ | ✅ | ❌ | ✅ |
| REPORTS_SAFT | ✅ | ✅ | ✅ | ❌ | ✅ |
| PERIOD_CLOSE | ✅ | ✅ | ✅ | ❌ | ❌ |
| PERIOD_OPEN | ✅ | ✅ | ❌ | ❌ | ❌ |
| YEAR_END_CLOSE | ✅ | ✅ | ❌ | ❌ | ❌ |
| BANK_CONNECT | ✅ | ✅ | ❌ | ❌ | ❌ |
| BANK_SYNC | ✅ | ✅ | ❌ | ❌ | ❌ |
| BACKUP_CREATE | ✅ | ✅ | ❌ | ❌ | ❌ |
| BACKUP_RESTORE | ✅ | ✅ | ❌ | ❌ | ❌ |

### 10.5 Håndhævelse

Tilladelser håndhæves gennem en 5-lags guard-kæde:

| Lag | Guard | Beskrivelse |
|-----|-------|-------------|
| **1** | Autentificering | Verifikation af gyldig session (login kræves) |
| **2** | Virksomhedsscopning | Verifikation af adgang til den valgte virksomhed |
| **3** | Tilladelsestjek | Verifikation af specifik tilladelse til handlingen |
| **4** | Demo-blokering | Forhindring af mutationer i demo-virksomheder |
| **5** | Tilsynsblokering | Forhindring af skrivetilladelser i tilsynstilstand |

**Dækning:** 47 af 89 API-ruter kræver specifikke tilladelser.

### 10.6 SUPER_DEV Tilsynsfunktion

Til teknisk support og compliance-audit tilbyder systemet en SUPER_DEV tilsynsfunktion:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Adgangstype** | Skrivebeskyttet læseadgang på tværs af tenants |
| **Tilladelser** | 6 specifikke læsetilladelser |
| **Logning** | Alle handlinger logges som OVERSIGHT i audit trail |
| **Begrænsning** | Ingen skrivetilladelser — kan kun læse data |

---

## 11. Regnskabsperioder og Afslutning

### 11.1 Regnskabsperioder

AlphaFlow arbejder med månedlige regnskabsperioder. Hver periode har en status, der styrer, om der kan bogføres i perioden.

| Status | Beskrivelse |
|--------|-------------|
| **OPEN** | Perioden er åben. Der kan bogføres nye poster. |
| **CLOSED** | Perioden er lukket. Ingen nye poster kan bogføres. |

### 11.2 Periodekontrol

| Funktion | Beskrivelse |
|----------|-------------|
| **Lukning** | Kræver `PERIOD_CLOSE`-tilladelse (OWNER, ADMIN, ACCOUNTANT) |
| **Genåbning** | Kræver `PERIOD_OPEN`-tilladelse (OWNER, ADMIN) |
| **Logning** | Alle lukninger og genåbninger logges i audit trail |
| **Bogføringsspærring** | Lukkede perioder kan ikke modtage nye journalposter |

### 11.3 Årsafslutning

AlphaFlow understøtter automatisk årsafslutning med resultatoverførsel:

| Parameter | Beskrivelse |
|-----------|-------------|
| **Tilladelse** | `YEAR_END_CLOSE` (OWNER, ADMIN) |
| **Forudsætning** | Alle perioder for året skal være lukkede |
| **Handling** | Overførsel af årets resultat til egenkapital |

**Bogføring ved årsafslutning:**

| Scenario | Debet | Kredit |
|----------|-------|--------|
| **Overskud** | Konto 3300 (Årets resultat) | Konto 3400 (Overført resultat) |
| **Underskud** | Konto 3400 (Overført resultat) | Konto 3300 (Årets resultat) |

Systemet opretter automatisk en journalpost, der bogfører resultatoverførslen. Handlingen logges uforanderligt i audit trail som en `YearEndClosing`-begivenhed.

### 11.4 Gentagende Poster

For at understøtte løbende regnskabsføring tilbyder AlphaFlow oprettelse af gentagende journalposter:

| Intervall | Beskrivelse |
|-----------|-------------|
| Dagligt | Gentages hver dag |
| Ugentligt | Gentages hver uge |
| Månedligt | Gentages hver måned |
| Kvartalsvis | Gentages hvert kvartal |
| Årligt | Gentages hvert år |

Gentagende poster opretter automatisk journalposter i den aktuelle periode ved udførelse.

### 11.5 Dokumentation af Periodehåndtering

Alle periode-relaterede handlinger dokumenteres via audit trail:

| Handling | Entitet | Logdata |
|----------|---------|---------|
| Periode lukket | FiscalPeriod | userId, companyId, periode-id, timestamp |
| Periode genåbnet | FiscalPeriod | userId, companyId, periode-id, timestamp, årsag |
| Årsafslutning udført | YearEndClosing | userId, companyId, år, beløb, journalpost-id |
| Gentagende post udført | RecurringEntry | userId, companyId, post-id, timestamp |

---

## 12. Compliance Matrix

Nedenstående matrix dokumenterer AlphaFlows overholdelse af de relevante krav i Bogføringsloven, Digitaliseringsbekendtgørelsen og GDPR.

### 12.1 Bogføringsloven

| Paragraf | Krav | Status | Implementering |
|----------|------|--------|----------------|
| § 1 stk. 1 | Bogføring af alle erhvervsmæssige transaktioner | ✅ Opfyldt | Dobbelt bogføring med debet/kredit. Journalposter med linjer. Alle transaktioner bogføres med dato, beløb, konti og reference. |
| § 4 stk. 1 | Regnskabsmateriale opbevares på betryggende måde | ✅ Opfyldt | AES-256-GCM kryptering i hvile (256-bit nøgle, autentificeret kryptering). TLS 1.3 kryptering i transit. PostgreSQL med sslmode=require. SHA-256 checksums på backups. |
| § 4 stk. 2 | Uforkortethed og beskyttelse mod uberettiget ændring | ✅ Opfyldt | AES-256-GCM autentificeret kryptering garanterer integritet (authentication tag). Uforanderlig audit trail — poster kan aldrig ændres eller slettes. Soft-delete med modpost og årsagsangivelse. |
| § 4 stk. 3 | Tydeligvis viser dokumentationens indhold og sammenhæng | ✅ Opfyldt | Komplet audit trail med before/after værdier. Tidsstempler, aktør, IP-adresse. 13+ begivenhedstyper. 20+ entitetstyper. |
| § 5 | Regnskabsmateriale skal kunne fremskaffes hurtigt | ✅ Opfyldt | Momentane databaseforespørgsler (PostgreSQL). SAF-T eksport (XML). OIOUBL eksport. PDF-rapporter. JSON-backup med direkte download. |
| § 10 stk. 1 | Fuldstændig, ægte og pålidelig dokumentation | ✅ Opfyldt | Uforanderlig audit trail med 13+ begivenhedstyper. Alle ændringer logges med fuld kontekst (userId, companyId, timestamp, IP, User-Agent, before/after). |
| § 11 stk. 1 | Adgang begrænset til autoriserede personer | ✅ Opfyldt | RBAC med 5 roller og 23 tilladelser. Multi-tenant isolation med virksomhedsscopning. 47 af 89 API-ruter kræver specifikke tilladelser. 5-lags guard-kæde. |
| § 11 stk. 2 | Adgangskontrol med logning | ✅ Opfyldt | Sessionsikkerhed med 32-byte tokens. LOGIN/LOGIN_FAILED/LOGOUT logges. Session-invalidering logges. IP- og User-Agent tracking. |
| § 12 | Elektronisk regnskabsmateriale kan aflæses | ✅ Opfyldt | PDF-rapporter (balance, resultatopgørelse, momsrapport). XML-eksport (SAF-T, OIOUBL). JSON-backup med manifest. Alle formater er menneskelæselige. |
| § 15 stk. 1 | Opbevaring i mindst 5 år | ✅ Opfyldt | Automatiske backups: Månedlig (60 måneder = 5 år), Ugentlig (52 uger), Daglig (30 dage). SHA-256 checksums til integritetsverifikation. |

### 12.2 Digitaliseringsbekendtgørelsen

| Paragraf | Krav | Status | Implementering |
|----------|------|--------|----------------|
| § 8 stk. 1 | Tilgængelighed i hele opbevaringsperioden | ✅ Opfyldt | TLS 1.3 sikrer krypteret adgang. AES-256-GCM sikrer dataintegritet i hvile. Data kan tilgås og dekrypteres gennem hele opbevaringsperioden med korrekt nøgle. Automatiske backups med 5-års retention. |
| § 8 stk. 2 | Tilstrækkelig sikkerhed | ✅ Opfyldt | Defense-in-depth med 5 sikkerhedslag. AES-256-GCM (256-bit), TLS 1.3, bcrypt (12 salt-runder), HSTS, RBAC. Automatisk certifikatfornyelse via Let's Encrypt. |

### 12.3 GDPR

| Artikel | Krav | Status | Implementering |
|---------|------|--------|----------------|
| Art. 32 stk. 1 | Sikkerhed for behandling — fortrolighed, integritet, tilgængelighed og modstandsdygtighed | ✅ Opfyldt | Kryptering i hvile (AES-256-GCM) og transit (TLS 1.3). Adgangskontrol (RBAC med 5 roller, 23 tilladelser). Uforanderlig audit trail. bcrypt med 12 salt-runder til adgangskoder. 32-byte kryptografiske sessionstokens. |

### 12.4 Samlet Compliance Status

| Lovgivning | Antal krav | Opfyldt | Delvist | Ikke opfyldt |
|-----------|-----------|---------|---------|--------------|
| Bogføringsloven | 10 | 10 | 0 | 0 |
| Digitaliseringsbekendtgørelsen | 2 | 2 | 0 | 0 |
| GDPR | 1 | 1 | 0 | 0 |
| **I alt** | **13** | **13** | **0** | **0** |

**Konklusion:** AlphaFlow opfylder alle 13 identificerede lovkrav fra Bogføringsloven, Digitaliseringsbekendtgørelsen og GDPR.

---

## 13. Bilag

### 13.1 Referencer til Teknisk Dokumentation

| Dokument | Sti | Beskrivelse |
|----------|------|-------------|
| **Krypteringsdokumentation** | `docs/ENCRYPTION.md` | Komplet teknisk beskrivelse af AES-256-GCM, TLS 1.3, adgangskodehashing, sessionsikkerhed og nøglehåndtering |
| **Brugsvejledning** | `docs/BRUGSVEJLEDNING.md` | Brugermanual med trin-for-trin instruktioner til alle systemfunktioner |

### 13.2 Referencer til Kildekode

| Komponent | Sti | Beskrivelse |
|-----------|------|-------------|
| **Krypteringsmodul** | `src/lib/crypto.ts` | AES-256-GCM krypterings-/dekrypteringsmodul (server-side) |
| **Adgangskodemodul** | `src/lib/password.ts` | bcrypt hashing med 12 salt-runder |
| **Sessionsmodul** | `src/lib/session.ts` | Sessionstyring med token-generering og udløb |
| **RBAC-modul** | `src/lib/rbac.ts` | Rolle- og tilladelsesdefinitioner |
| **Audit-modul** | `src/lib/audit.ts` | Uforanderlig audit trail |
| **Backup-motor** | `src/lib/backup-engine.ts` | Backup- og gendannelseslogik |
| **Backup-planlægger** | `src/lib/backup-scheduler.ts` | Automatisk backup-planlægning |
| **SAF-T-validator** | `src/lib/saft-validator.ts` | 23+ valideringskontroller for SAF-T eksport |
| **OIOUBL-generator** | `src/lib/oioubl-generator.ts` | Generering af OIOUBL XML |
| **OIOUBL-validator** | `src/lib/oioubl-validator.ts` | Validering af OIOUBL |
| **PDF-generator** | `src/lib/pdf-generator.ts` | Generering af PDF-rapporter |
| **Matching-motor** | `src/lib/matching-engine.ts` | Automatisk bankafstemning |
| **Adgangsguard** | `src/lib/access-guard.ts` | Multi-lags adgangskontrol |
| **Prisma-skema** | `prisma/schema.prisma` | 23 modeller, 15 enums |
| **SAF-T eksport** | `src/app/api/export-saft/route.ts` | API-rute for SAF-T eksport |
| **OIOUBL eksport** | `src/app/api/invoices/[id]/oioubl/route.ts` | API-rute for OIOUBL eksport |
| **Backup API** | `src/app/api/backups/route.ts` | API-rute for backup |
| **Backup gendannelse** | `src/app/api/backups/upload-restore/route.ts` | API-rute for gendannelse |
| **Caddy-konfiguration** | `Caddyfile` | Reverse proxy, TLS, sikkerhedshoveder |

### 13.3 Revision og Godkendelse

| Felt | Indhold |
|------|---------|
| **Udarbejdet af** | AlphaFlow systemudvikling |
| **Dato** | 2025 |
| **Version** | 1.0 |
| **Næste revision** | Ved væsentlige systemændringer eller lovændringer |

---

*Dette dokument udgør AlphaFlows intern kontrolrapport og compliance-dokumentation, udarbejdet til brug for Erhvervsstyrelsens godkendelse af AlphaFlow som digitalt regnskabssystem i henhold til Bogføringsloven (LBK nr. 1316 af 14/08/2023) og Bekendtgørelse om digitalisering af regnskabsmateriale.*

*Alle oplysninger i dette dokument er baseret på den faktiske implementering i produktionskoden og er verificeret mod kildekoden.*
