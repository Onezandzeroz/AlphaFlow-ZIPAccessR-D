# AlphaFlow — Kryptografisk Sikkerhed & Databeskyttelse

**Dokumenttype:** Teknisk sikkerhedsdokumentation  
**Version:** 1.0  
**Dato:** 2025  
**Gyldighedsområde:** AlphaFlow produktionsmiljø (alphaflow.dk)  
**Compliance-mål:** Erhvervsstyrelsen — Bogføringsloven, Digitaliseringsbekendtgørelsen

---

## Indholdsfortegnelse

1. [Introduktion](#1-introduktion)
2. [Kryptografisk Arkitektur (Overblik)](#2-kryptografisk-arkitektur-overblik)
3. [AES-256-GCM Kryptering i Hvile (At-Rest)](#3-aes-256-gcm-kryptering-i-hvile-at-rest)
4. [TLS 1.3 Kryptering i Transit (In-Transit)](#4-tls-13-kryptering-i-transit-in-transit)
5. [Databaseforbindelsessikkerhed](#5-databaseforbindelsessikkerhed)
6. [Adgangskodesikkerhed](#6-adgangskodesikkerhed)
7. [Sessionsikkerhed](#7-sessionsikkerhed)
8. [Nøglehåndtering (Key Management)](#8-nøglehåndtering-key-management)
9. [Audit Trail for Sikkerhedshændelser](#9-audit-trail-for-sikkerhedshændelser)
10. [Berørte Filer og Komponenter](#10-berørte-filer-og-komponenter)
11. [Compliance Matrix — Bogføringsloven](#11-compliance-matrix--bogføringsloven)
12. [Appendiks: Tekniske Detaljer](#12-appendiks-tekniske-detaljer)

---

## 1. Introduktion

Dette dokument beskriver AlphaFlows samlede kryptografiske sikkerhedsimplementering, herunder kryptering af data i hvile (at-rest), kryptering under transit (in-transit), adgangskodehåndtering, sessionsikkerhed, nøglehåndtering og audit trail.

Dokumentet er udarbejdet som teknisk dokumentation til brug for Erhvervsstyrelsens compliance-vurdering af AlphaFlow i forhold til:

- **Bogføringsloven** (LBK nr. 1316 af 14/08/2023)
- **Bekendtgørelse om digitalisering af regnskabsmateriale** (Digitaliseringsbekendtgørelsen)
- **GDPR** (EU's generelle databeskyttelsesforordning, artikel 32)

AlphaFlow benytter et *defense-in-depth*-princip, hvor data beskyttes på flere lag:

| Lag | Sikkerhedsforanstaltning | Beskyttelse |
|-----|--------------------------|-------------|
| Netværk | TLS 1.3 + HSTS | Kryptering af al netværkstrafik |
| Transport | `sslmode=require` (PostgreSQL) | Krypteret databaseforbindelse |
| Applikation | AES-256-GCM | Kryptering af følsomme data før lagring |
| Adgangskontrol | bcrypt + RBAC | Sikker autentificering og autorisation |
| Overvågning | Audit trail | Uforanderlig logning af alle ændringer |

---

## 2. Kryptografisk Arkitektur (Overblik)

Nedenstående diagram illustrerer dataflowet gennem AlphaFlows kryptografiske lag:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ALPHAFLOW KRYPTOGRAFISK ARKITEKTUR              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Klient (Browser)                                                   │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  HTTPS (TLS 1.3)                                        │      │
│  │  ├── HSTS: max-age=31536000; includeSubDomains; preload │      │
│  │  ├── X-Frame-Options: DENY                              │      │
│  │  ├── X-Content-Type-Options: nosniff                    │      │
│  │  ├── X-XSS-Protection: 1; mode=block                   │      │
│  │  ├── Referrer-Policy: strict-origin-when-cross-origin   │      │
│  │  └── Permissions-Policy: kamera, mikrofon, lokation     │      │
│  └──────────────────────┬───────────────────────────────────┘      │
│                         │                                           │
│                         ▼ TLS 1.3 (Let's Encrypt)                  │
│                                                                     │
│  Caddy Reverse Proxy                                                │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  alphaflow.dk                                           │      │
│  │  ├── Automatiske certifikater (Let's Encrypt)           │      │
│  │  ├── Minimum TLS 1.2, standard TLS 1.3                  │      │
│  │  ├── Gzip / Zstandard komprimering                      │      │
│  │  └── Automatisk HTTP→HTTPS omdirigering                 │      │
│  └──────────────────────┬───────────────────────────────────┘      │
│                         │                                           │
│                         ▼ Intern kommunikation                      │
│                                                                     │
│  AlphaFlow Applikation (Next.js)                                    │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                                                          │      │
│  │  ┌──────────────────────────────────────────────────┐   │      │
│  │  │  Krypteringsmodul (src/lib/crypto.ts)            │   │      │
│  │  │  ├── AES-256-GCM kryptering/dekryptering        │   │      │
│  │  │  ├── Nøgle: ENCRYPTION_KEY (32 bytes / 256 bit)  │   │      │
│  │  │  ├── IV: 12 bytes (96 bit) — tilfældig pr. op.   │   │      │
│  │  │  └── Auth Tag: 16 bytes (128 bit)                 │   │      │
│  │  └──────────────────────────────────────────────────┘   │      │
│  │                          │                               │      │
│  │                          ▼                               │      │
│  │  ┌──────────────────────────────────────────────────┐   │      │
│  │  │  Adgangskodemodul (src/lib/password.ts)          │   │      │
│  │  │  └── bcrypt med 12 salt-runder                    │   │      │
│  │  └──────────────────────────────────────────────────┘   │      │
│  │                          │                               │      │
│  │                          ▼                               │      │
│  │  ┌──────────────────────────────────────────────────┐   │      │
│  │  │  Sessionshåndtering                                │   │      │
│  │  │  ├── Tilfældig session-token                      │   │      │
│  │  │  ├── IP-adresse, User-Agent tracking              │   │      │
│  │  │  └── Automatisk udløb og oprydning                │   │      │
│  │  └──────────────────────────────────────────────────┘   │      │
│  └──────────────────────┬───────────────────────────────────┘      │
│                         │                                           │
│                         ▼ sslmode=require (TLS)                     │
│                                                                     │
│  PostgreSQL (Neon — Managed)                                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Datalagring                                            │      │
│  │  ├── Adgangskoder: bcrypt-hash                          │      │
│  │  ├── Bank-tokens: AES-256-GCM krypteret                 │      │
│  │  │   Format: iv_base64:authTag_base64:ciphertext_base64 │      │
│  │  ├── Sessions: krypteret transport, token i database    │      │
│  │  └── Regnskabsdata: krypteret transport                 │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. AES-256-GCM Kryptering i Hvile (At-Rest)

### 3.1 Formål

Alle bankadgangstokens (`accessToken`) og opdateringstokens (`refreshToken`) krypteres, før de lagres i databasen. Dette sikrer, at selv ved uautoriseret adgang til databasen, ikke kan læse bankoplysningerne.

### 3.2 Algoritme

| Parameter | Værdi |
|-----------|-------|
| Algoritme | **AES-256-GCM** (Advanced Encryption Standard — Galois/Counter Mode) |
| Nøglelængde | 256 bit (32 bytes) |
| IV (Initialization Vector) | 96 bit (12 bytes) — tilfældig ved hver kryptering |
| Authentication Tag | 128 bit (16 bytes) |
| Nøglekilde | Miljøvariablen `ENCRYPTION_KEY` (hex-kodet, 64 tegn) |

### 3.3 Hvorfor AES-256-GCM?

AES-256-GCM er valgt, fordi det er en **autentificeret krypteringsalgoritme** (Authenticated Encryption with Associated Data — AEAD). Det betyder, at algoritmen leverer:

1. **Fortrolighed (Confidentiality):** Data kan kun læses med den korrekte nøgle.
2. **Integritet (Integrity):** Enhver manipulation af krypteret data afsløres ved dekryptering. GCM's authentication tag verificerer, at data ikke er blevet ændret, og at det blev krypteret med den korrekte nøgle.

Dette er afgørende for compliance med Bogføringsloven § 4 stk. 2, der kræver, at regnskabsmateriale ikke kan tillesidesættes eller ændres uberettiget.

### 3.4 Krypteringsproces

```
Input:  plaintext_token (bank access/refresh token)
        ENCRYPTION_KEY (256-bit hex)

Trin 1: Generer tilfældig IV (12 bytes) via crypto.getRandomValues()
Trin 2: Krypter med AES-256-GCM
        → Output: ciphertext + authentication tag
Trin 3: Kod alle dele som Base64
Trin 4: Kombiner til lagringsformat:
        iv_base64 : authTag_base64 : ciphertext_base64

Output: Krypteret streng lagret i databasen
```

### 3.5 Dekrypteringsproces

```
Input:  krypteret_streng (fra database)
        ENCRYPTION_KEY (256-bit hex)

Trin 1: Split streng ved ":" → [iv_base64, authTag_base64, ciphertext_base64]
Trin 2: Dekod Base64 → iv (12 bytes), authTag (16 bytes), ciphertext
Trin 3: Dekrypter med AES-256-GCM
        → GCM verificerer automatisk authentication tag
        → Hvis tag ikke matcher: FEJL (data er manipuleret eller forkert nøgle)
Trin 4: Returner plaintext token

Output: Original bank token (kun i hukommelsen, aldrig lagret ukrypteret)
```

### 3.6 Lagringsformat i Databasen

Krypterede bank-tokens lagres i PostgreSQL i følgende format:

```
iv_base64:authTag_base64:ciphertext_base64
```

| Del | Længde (Base64) | Beskrivelse |
|-----|-----------------|-------------|
| `iv_base64` | 16 tegn | Initialization Vector (12 bytes, Base64-kodet) |
| `authTag_base64` | 24 tegn | Authentication Tag (16 bytes, Base64-kodet) |
| `ciphertext_base64` | Variabel | Krypteret token (Base64-kodet) |

### 3.7 IV-håndtering

- Hver krypteringsoperation genererer en **ny tilfældig IV** (12 bytes / 96 bit).
- IV'er **genbruges aldrig** — dette er et kritisk sikkerhedskrav for GCM-tilstand.
- IV behøver ikke holdes hemmelig, men skal være unik for hver kryptering med samme nøgle.
- IV'en genereres via `crypto.getRandomValues()`, som bruger operativsystemets kryptografisk sikre tilfældighedsgenerator (CSPRNG).

### 3.8 Bagudkompatibilitet (Migration)

Systemet understøtter automatisk migration af ældre, ukrypterede tokens:

- **Legacy format:** Ren Base64-kodet token (før kryptering blev implementeret).
- **Migration:** Ved dekryptering detekteres legacy-format automatisk. Tokenen returneres som-is, men ved næste opdatering krypteres den med AES-256-GCM.
- Dette sikrer en gradvis migration uden nedetid eller manuelt indgreb.

### 3.9 Nøglecaching

Krypteringsnøglen parses fra hex-format til `Buffer` ved første brug og caches derefter i hukommelsen. Dette forbedrer ydeevnen ved hyppige krypterings-/dekrypteringsoperationer og reducerer risikoen for parsing-fejl ved gentagne kald.

### 3.10 Implementeringsmodul

Al kryptering er centraliseret i én server-side modul:

- **Fil:** `src/lib/crypto.ts`
- **Miljø:** Server-side kun (indlejres ikke i klient-kode)
- **Funktioner:** `encrypt()` og `decrypt()`
- **Runtime:** Node.js `crypto` modul (Web Crypto API understøttes ikke på server-side i denne kontekst)

---

## 4. TLS 1.3 Kryptering i Transit (In-Transit)

### 4.1 Certifikathåndtering

AlphaFlow benytter **Caddy** som reverse proxy med automatisk certifikathåndtering via **Let's Encrypt**:

| Parameter | Konfiguration |
|-----------|---------------|
| Reverse Proxy | Caddy v2 |
| Certifikatudsteder | Let's Encrypt (automatisk fornyelse) |
| Produktionsdomæne | `alphaflow.dk` |
| Minimum TLS-version | TLS 1.2 |
| Standard TLS-version | TLS 1.3 |
| Certifikatfornyelse | Automatisk (Caddy håndterer fornyelse inden udløb) |

### 4.2 HTTP Strict Transport Security (HSTS)

AlphaFlow aktiverer HSTS med følgende konfiguration:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

| Parameter | Værdi | Betydning |
|-----------|-------|-----------|
| `max-age` | 31536000 sekunder (1 år) | Browseren vil kun bruge HTTPS i 1 år |
| `includeSubDomains` | Aktiveret | Gælder også for alle subdomæner |
| `preload` | Aktiveret | Indsender til browser-preload lister for endnu strengere håndhævelse |

Dette forhindrer downgrade-angreb, hvor en angriber forsøger at tvinge forbindelsen ned på HTTP.

### 4.3 Sikkerhedshoveder (Security Headers)

Udover HSTS sætter Caddy følgende sikkerhedshoveder på alle svar:

| Header | Værdi | Formål |
|--------|-------|--------|
| `X-Frame-Options` | DENY | Forhindrer clickjacking via iframe-indlejring |
| `X-Content-Type-Options` | nosniff | Forhindrer MIME-type sniffing |
| `X-XSS-Protection` | 1; mode=block | Aktiverer browser-indbygget XSS-filter |
| `Referrer-Policy` | strict-origin-when-cross-origin | Begrænser referrer-information ved cross-origin |
| `Permissions-Policy` | Kamera, mikrofon, lokation | Begrænser browser-API-adgang |

### 4.4 Komprimering

Caddy er konfigureret med komprimering for at reducere båndbredde:

- **Gzip** — bredt understøttet af alle browsere
- **Zstandard (zstd)** — nyere algoritme med bedre komprimeringsforhold

Komprimering aktiveres kun over krypterede forbindelser (HTTPS), hvilket forhindrer CRIME/BREACH-type angreb.

---

## 5. Databaseforbindelsessikkerhed

### 5.1 PostgreSQL på Neon

AlphaFlow benytter **Neon** som managed PostgreSQL-udbyder:

- **Database:** PostgreSQL (latest stable version)
- **Hosting:** Neon Serverless Postgres (managed service)
- **Forbindelsessikkerhed:** `sslmode=require` i forbindelsesstrengen

### 5.2 Krypteret Forbindelse

Alle data, der transmitteres mellem AlphaFlow-applikationen og databasen, er krypteret via TLS:

```
Forbindelsesstreng: postgresql://...?sslmode=require
```

Med `sslmode=require`:

- Applikationen **kræver** en TLS-krypteret forbindelse til databasen.
- Forbindelsen **afvises**, hvis databasen ikke kan præsentere et gyldigt TLS-certifikat.
- Ingen data traverserer netværket ukrypteret.

Dette sikrer, at:

1. Bank-tokens er krypteret to gange: AES-256-GCM (data) + TLS (transport).
2. Regnskabsdata er beskyttet under transit mellem applikation og database.
3. Sessionsdata og brugeroplysninger transmitteres krypteret.

---

## 6. Adgangskodesikkerhed

### 6.1 Hashing-algoritme

Brugeradgangskoder hashes med **bcrypt** før lagring:

| Parameter | Værdi |
|-----------|-------|
| Algoritme | bcrypt |
| Salt-runder | 12 |
| Implementering | `src/lib/password.ts` |
| Lagring | Kun hash — adgangskoden gemmes aldrig i klartekst |

### 6.2 Hvorfor bcrypt?

bcrypt er specifikt designet til adgangskodehashing:

- **Indbygget salt:** Hver adgangskode får et unikt salt automatisk.
- **Langsom algoritme:** Bevidst beregningsmæssig dyr, hvilket gør brute-force-angreb ineffektive.
- **12 runder:** Balancerer sikkerhed og ydeevne (ca. 250 ms pr. hash på moderne hardware).
- **Kollisionssikker:** Hash-outputtet er unikt for hver adgangskode + salt-kombination.

### 6.3 Sikkerhedsprincipper

- Adgangskoder ** transmitteres aldrig i klartekst uden for krypteret forbindelse (TLS 1.3).
- Adgangskoder **lagres aldrig** i klartekst i databasen eller logs.
- Adgangskoder **logges aldrig** eller vises i nogen form af fejlsider.
- Ved login sammenlignes kun hashes — original adgangskode findes kun kortvarigt i hukommelsen under validering.

---

## 7. Sessionsikkerhed

### 7.1 Session-Token

AlphaFlow genererer et **kryptografisk tilfældigt token** ved login:

- Token er en tilfældig streng med tilstrækkelig entropi.
- Token lagres i databasen og bruges som identifikator for den aktive session.
- Token transmitteres via HTTPS (TLS 1.3).

### 7.2 Session-Metadata

Hver session registrerer følgende metadata:

| Felt | Beskrivelse |
|------|-------------|
| IP-adresse | Klientens IP-adresse ved oprettelse |
| User-Agent | Browser/ enhed identifikation |
| Aktiv virksomhed | Valgt virksomhedskontekst |
| Tilsynsvirksomhed | Tilsyns-virksomhedskontekst (for tilsynsførende brugere) |

### 7.3 Session-Udløb og Oprydning

- Sessions har en **begrænset levetid** og udløber automatisk.
- Udløbne sessions **slettes automatisk** fra databasen.
- Dette reducerer risikoen for session-hijacking med gamle tokens.

### 7.4 Sikkerhedsegenskaber

- Session-token er **statsfuldt** (gemt i databasen) — kan tilbagekaldes øjeblikkeligt.
- Ved mistænkelig aktivitet kan alle sessions for en bruger tilbagekaldes samtidig.
- Session-binding til IP og User-Agent muliggør registrering af anomali.

---

## 8. Nøglehåndtering (Key Management)

### 8.1 Nøgleopbevaring

Krypteringsnøglen (`ENCRYPTION_KEY`) håndteres med følgende restriktioner:

| Regel | Beskrivelse |
|-------|-------------|
| **Kun miljøvariabel** | Nøglen læses fra `process.env.ENCRYPTION_KEY` |
| **Aldrig i database** | Nøglen gemmes aldrig i nogen databasetabel |
| **Aldrig i git** | Nøglen er ekskluderet fra versionsstyring via `.gitignore` |
| **Kun server-side** | Nøglen er kun tilgængelig i server-side kode |

### 8.2 Formatering

```
ENCRYPTION_KEY=<64 hex-tegn>
Eksempel: a1b2c3d4e5f6... (32 bytes = 256 bit, repræsenteret som 64 hex-tegn)
```

### 8.3 Risikobeskrivelse

> **ADVARSEL:** Tab af `ENCRYPTION_KEY` medfører **permanent tab** af alle krypterede bank-tokens. Dette er en bevidst designbeslutning — der findes ingen "backdoor" eller nøglekopi.

Brugere vil i så fald skulle genautorisere deres bankforbindelser via en ny samtykkeprocess (re-consent).

### 8.4 Anbefalinger til Produktion

Til produktionsmiljøet anbefales følgende nøglehåndteringspraksis:

| Anbefaling | Beskrivelse |
|------------|-------------|
| **Secrets Manager** | Brug en dedikeret secrets manager som AWS Secrets Manager, HashiCorp Vault eller Azure Key Vault |
| **Rotation** | Implementer regelmæssig nøglerotation (se afsnit 8.5) |
| **Adgangskontrol** | Begræns adgangen til nøglen til minimum antal personer/tjenester |
| **Overvågning** | Overvåg adgang til nøglen og log eventuelle læsninger |
| **Backup** | Sikker backup af nøglen i offline, fysisk sikret lokation |

### 8.5 Nøglerotationsprocedure

Ved rotation af krypteringsnøglen skal følgende trin følges:

```
Trin 1: Generer ny ENCRYPTION_KEY (256 bit tilfældig)
Trin 2: Opdater miljøvariablen i produktion (med GAMMEL nøgle stadig tilgængelig)
Trin 3: Udfør migreringsscript:
        a. Læs alle krypterede bank-tokens med GAMMEL nøgle
        b. Dekrypter hver token
        c. Krypter hver token med NY nøgle
        d. Gem opdaterede tokens i databasen
Trin 4: Bekræft, at alle tokens er migreret
Trin 5: Fjern GAMMEL nøgle fra miljøvariablen
Trin 6: Slet GAMMEL nøgle fra alle backups
```

> **Bemærk:** Denne procedure kræver, at både gammel og ny nøgle er tilgængelige samtidigt under migreringen.

---

## 9. Audit Trail for Sikkerhedshændelser

### 9.1 Uforanderlig Audit Log

AlphaFlow implementerer en **uforanderlig audit trail** (log over alle ændringer):

- Alle mutationer til `BankConnection`-poster logges med fuld kontekst.
- Kryptering/dekryptering af tokens sker **gennemsigtigt** på service-laget — audit-loggen registrerer handlingen, ikke selve den krypterede data.
- Loggen registrerer: **hvem**, **hvad**, **hvornår** og **hvorfra**.

### 9.2 Loggenelementer

| Element | Beskrivelse |
|---------|-------------|
| Handling (action) | Type af ændring (oprettelse, opdatering, sletning, etc.) |
| Aktør (actor) | Hvilken bruger der udførte handlingen |
| Tidspunkt (timestamp) | Præcis tidspunkt for handlingen (ISO 8601) |
| Kontekst (context) | IP-adresse, user-agent, session-ID |
| Før-værdi (before) | Tilstand før ændringen |
| Efter-værdi (after) | Tilstand efter ændringen |

### 9.3 Begivenhedstyper

Audit-loggen understøtter **13+ begivenhedstyper**, der dækker alle kritiske operationer i systemet, herunder:

- Oprettelse af bankforbindelse
- Opdatering af bankforbindelse
- Tilbagekaldelse af samtykke
- Token-kryptering og -dekryptering (når relevante)
- Adgangskodeændring
- Login/logout
- Rolle- og tilladelsesændringer
- Virksomhedsoprettelse og -ændring

### 9.4 Gennemsigtig Kryptering

Krypterings- og dekrypteringsoperationer påvirker ikke audit trailens funktionalitet:

- **Oprettelse:** Token krypteres før lagring → audit log registrerer "bankforbindelse oprettet".
- **Læsning (sync):** Token dekrypteres midlertidigt → audit log registrerer "bankforbindelse synkroniseret".
- **Tilbagekaldelse:** Token nullificeres → audit log registrerer "samtykke tilbagekaldt".

---

## 10. Berørte Filer og Komponenter

Nedenstående tabel viser alle kildekodefiler, der er direkte involveret i krypteringsimplementeringen:

| Fil | Rolle |
|-----|-------|
| `src/lib/crypto.ts` | Krypterings-/dekrypteringsmodul. Implementerer AES-256-GCM med tilfældig IV, authentication tag og hex-nøgleparsing. Server-side kun. |
| `src/lib/password.ts` | Adgangskode-hashingsmodul. Implementerer bcrypt med 12 salt-runder. |
| `src/app/api/bank-connections/route.ts` | API-rute for bankforbindelser. Krypterer bank-tokens ved oprettelse, dekrypterer ved synkronisering. |
| `src/app/api/bank-connections/[id]/consent/route.ts` | API-rute for samtykkefornyelse. Krypterer nye bank-tokens ved fornyelse af samtykke. |
| `src/app/api/bank-connections/[id]/route.ts` | API-rute for individuel bankforbindelse. Nullificerer (sletter) krypterede tokens ved tilbagekaldelse. |
| `prisma/schema.prisma` | Prisma-skema med `BankConnection`-modellen. Definerer `accessToken`- og `refreshToken`-felter, der lagrer krypterede værdier. |
| `src/lib/audit.ts` | Audit trail-modul. Uforanderlig logning af alle sikkerhedsrelevante begivenheder. |
| `src/lib/rbac.ts` | Rollebaseret adgangskontrol. 23 tilladelser fordelt på 5 roller. |
| `src/lib/session.ts` | Sessionshåndtering. Genererer session-tokens, tracker metadata og håndterer udløb. |

---

## 11. Compliance Matrix — Bogføringsloven

Nedenstående matrix kortlægger AlphaFlows sikkerhedsforanstaltninger til de relevante paragraffer i Bogføringsloven og Digitaliseringsbekendtgørelsen:

| Paragraf | Krav | AlphaFlow Implementering | Opfyldt |
|----------|------|--------------------------|---------|
| **Bogføringsloven § 4 stk. 2** | Regnskabsmateriale skal opbevares på en måde, der sikrer dets uforkortethed og at det ikke uberettiget kan tillesidesættes eller ændres | AES-256-GCM (autentificeret kryptering) sikrer integritet. Manipulation af krypteret data afsløres ved dekryptering via authentication tag. Uforanderlig audit trail. | ✅ Ja |
| **Bogføringsloven § 4 stk. 3** | Regnskabsmateriale skal opbevares på en sikker og betryggende måde, som tydeligt viser dokumentationens indhold og sammenhæng | Komplet audit trail med tidsstempler, aktør, før/efter værdier. 13+ begivenhedstyper. Krypterede tokens kan spores gennem hele livscyklussen. | ✅ Ja |
| **Bogføringsloven § 10** | Enhver, der fører regnskab, skal sørge for, at der er en fuldstændig, ægte og pålidelig dokumentation | Audit-log system med 13+ begivenhedstyper. Alle ændringer logges uforanderligt med fuld kontekst (hvem, hvad, hvornår, hvorfra). | ✅ Ja |
| **Bogføringsloven § 11** | Adgang til regnskabsmateriale skal være begrænset til autoriserede personer | RBAC med 5 roller og 23 tilladelser. Multi-tenant adgangskontrol med virksomhedsscopning. 47 af 83 API-ruter kræver specifikke tilladelser. | ✅ Ja |
| **Bogføringsloven § 15** | Regnskabsmateriale skal opbevares i mindst 5 år | Automatiseret backup med SHA-256 checksums. 5-års opbevaringsperiode. Krypteret backup via AES-256-GCM + TLS i transit. | ✅ Ja |
| **Digitaliseringsbekendtgørelsen § 8** | Elektronisk regnskabsmateriale skal være tilgængeligt og kunne aflæses gennem hele opbevaringsperioden | TLS 1.3 sikrer krypteret adgang. AES-256-GCM sikrer dataintegritet i hvile. Al data kan dekrypteres og præsenteres med korrekt nøgle. | ✅ Ja |
| **Digitaliseringsbekendtgørelsen § 8, stk. 2** | Sikkerheden for det elektroniske regnskabsmateriale skal være tilstrækkelig | AES-256-GCM (256-bit) + TLS 1.3 + bcrypt (12 runder) + HSTS + RBAC. Multi-lag sikkerhed (defense-in-depth). | ✅ Ja |
| **GDPR Art. 32** | Sikkerhed for behandling — evnen til at sikre fortrolighed, integritet, tilgængelighed og modstandsdygtighed | Kryptering i hvile (AES-256-GCM) og transit (TLS 1.3). Adgangskontrol (RBAC, bcrypt). Audit trail. Nøglehåndteringsprocedurer. | ✅ Ja |

### 11.1 Yderligere Compliance-betragtninger

**Data-minimering:** Kun nødvendige bankoplysninger (access og refresh tokens) krypteres. Andre data beskyttes via transportkryptering og adgangskontrol.

**Ret til sletelse (GDPR Art. 17):** Krypterede bank-tokens kan slettes permanent ved tilbagekaldelse af samtykke. Nullificering af tokens er logget i audit trail.

**Data-portabilitet (GDPR Art. 20):** Regnskabsdata kan eksporteres i læsbare formater. Krypterede tokens er transiente (kan genautoriseres) og udgør ikke en del af brugerens persondata i portabilitets-sammenhæng.

---

## 12. Appendiks: Tekniske Detaljer

### 12.1 AES-256-GCM Parameter-referencer

```
┌────────────────────────────────────────────────────────┐
│             AES-256-GCM Parameter Oversigt             │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Nøgle (Key)                                           │
│  ├── Størrelse: 256 bit (32 bytes)                     │
│  ├── Format: Hex-kodet (64 tegn i ENCRYPTION_KEY)      │
│  ├── Kilde: Miljøvariabel (ikke database/git)          │
│  └── Caching: Parseres én gang, caches i hukommelsen   │
│                                                        │
│  Initialization Vector (IV / Nonce)                    │
│  ├── Størrelse: 96 bit (12 bytes)                      │
│  ├── Generering: crypto.getRandomValues() (CSPRNG)     │
│  ├── Unik: Ny IV pr. kryptering — aldrig genbrugt      │
│  └── Hemmelig: Nej (men skal være unik)                │
│                                                        │
│  Authentication Tag (Auth Tag)                         │
│  ├── Størrelse: 128 bit (16 bytes)                     │
│  ├── Formål: Garanterer integritet af ciphertext       │
│  └── Verifikation: Automatisk ved dekryptering (GCM)   │
│                                                        │
│  Ciphertext                                            │
│  ├── Størrelse: Samme længde som plaintext             │
│  ├── Format: Base64-kodet i databasen                  │
│  └── Integritet: Garanteret af auth tag                │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### 12.2 Database Lagringsformat — Eksempel

```
Felt: accessToken (BankConnection)

Værdi i database:
  dGhpc2lzYXJhbmRvbWl2MTI= : YW5kYXV0aHRhZzE2Ynl0ZXM= : aW5jb3V0Y2lwaGVydGV4dGJhc2U2NA==

Opdelt:
  ├── IV (Base64):          dGhpc2lzYXJhbmRvbWl2MTI=  (12 bytes)
  ├── Auth Tag (Base64):     YW5kYXV0aHRhZzE2Ynl0ZXM=  (16 bytes)
  └── Ciphertext (Base64):   aW5jb3V0Y2lwaGVydGV4dGJhc2U2NA==  (variabel)
```

### 12.3 Sikkerhedshoveder — Komplet Oversigt

```
┌──────────────────────────────────────────────────────────┐
│  AlphaFlow Sikkerhedshoveder (sæt af Caddy)             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Strict-Transport-Security:                              │
│    max-age=31536000; includeSubDomains; preload          │
│    → Browser tvinges til HTTPS i 1 år                    │
│                                                          │
│  X-Frame-Options: DENY                                   │
│    → Forhindrer indlejring i iframe (clickjacking)        │
│                                                          │
│  X-Content-Type-Options: nosniff                         │
│    → Forhindrer MIME-type sniffing                       │
│                                                          │
│  X-XSS-Protection: 1; mode=block                         │
│    → Aktiverer XSS-filter i browser                      │
│                                                          │
│  Referrer-Policy: strict-origin-when-cross-origin         │
│    → Begrænser referrer-information                      │
│                                                          │
│  Permissions-Policy: camera=(), microphone=(), ...        │
│    → Begrænser adgang til browser-API'er                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 12.4 Sikkerheds-Lag (Defense in Depth)

```
┌─────────────────────────────────────────┐
│  Lag 1: Netværkssikkerhed              │
│  ├── TLS 1.3 (krypteret transit)       │
│  ├── HSTS (forhindrer downgrade)       │
│  └── Sikkerhedshoveder                 │
├─────────────────────────────────────────┤
│  Lag 2: Transportsikkerhed             │
│  ├── sslmode=require (PostgreSQL)       │
│  └── Krypteret DB-forbindelse          │
├─────────────────────────────────────────┤
│  Lag 3: Datasikkerhed (At-Rest)        │
│  ├── AES-256-GCM (bank tokens)         │
│  └── bcrypt (adgangskoder)             │
├─────────────────────────────────────────┤
│  Lag 4: Adgangskontrol                 │
│  ├── RBAC (5 roller, 23 tilladelser)   │
│  ├── Session-management               │
│  └── Multi-tenant isolation           │
├─────────────────────────────────────────┤
│  Lag 5: Overvågning                   │
│  ├── Audit trail (uforanderlig)        │
│  ├── 13+ begivenhedstyper             │
│  └── Fuld kontekst (hvem/hvad/hvornår)│
└─────────────────────────────────────────┘
```

---

*Dette dokument udgør AlphaFlows tekniske dokumentation af kryptografisk sikkerhed og databeskyttelse, udarbejdet til brug for Erhvervsstyrelsens compliance-vurdering i henhold til Bogføringsloven og Digitaliseringsbekendtgørelsen.*
