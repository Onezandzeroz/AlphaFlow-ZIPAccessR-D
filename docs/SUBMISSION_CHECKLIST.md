# Indsendelsesguide — Erhvervsstyrelsen Godkendelse af Digitalt Regnskabssystem

---

**Systemnavn:** AlphaFlow (alphaflow.dk)  
**Dokumentversion:** 1.0  
**Udarbejdet:** 2025  
**Formål:** Indsendelsesguide til Erhvervsstyrelsen i forbindelse med godkendelse af AlphaFlow som digitalt regnskabssystem  

---

## Indholdsfortegnelse

1. [Krav fra Erhvervsstyrelsen](#1-krav-fra-erhvervsstyrelsen)
2. [Dokumentationspakke](#2-dokumentationspakke)
3. [Forberedelse af Indsendelse](#3-forberedelse-af-indsendelse)
4. [Dokument-Checkliste](#4-dokument-checkliste)
5. [Teknisk Verifikation](#5-teknisk-verifikation)
6. [Compliance-Dækning](#6-compliance-dækning)
7. [Indsendelsesproces](#7-indsendelsesproces)
8. [Efter Indsendelse](#8-efter-indsendelse)
9. [Referencer](#9-referencer)

---

## 1. Krav fra Erhvervsstyrelsen

For at få et digitalt regnskabssystem godkendt af Erhvervsstyrelsen skal følgende kriterier være opfyldt:

| Krav | Beskrivelse | Lovgrundlag |
|------|-------------|-------------|
| **Dokumentation** | Komplet dokumentation af systemets funktioner og sikkerhed | Bogføringsloven § 10 |
| **Dobbelt bogføring** | Systemet skal understøtte dobbelt bogføring (debet/kredit) | Bogføringsloven § 1 |
| **Uforanderlig audit trail** | Alle ændringer skal logges uforanderligt | Bogføringsloven § 4 stk. 2-3, § 10 |
| **Opbevaring (5 år)** | Data skal opbevares sikkert i mindst 5 år | Bogføringsloven § 15 |
| **Adgangskontrol** | Adgang skal være begrænset til autoriserede personer | Bogføringsloven § 11 |
| **SAF-T eksport** | Mulighed for at eksportere regnskabsdata i SAF-T format | Digitaliseringsbekendtgørelsen |
| **Læsbarhed** | Regnskabsmateriale skal kunne aflæses gennem hele opbevaringsperioden | Bogføringsloven § 12 |
| **Datasikkerhed** | Tilstrækkelig sikkerhed for elektronisk regnskabsmateriale | Digitaliseringsbekendtgørelsen § 8 stk. 2 |

---

## 2. Dokumentationspakke

Følgende dokumenter udgør AlphaFlows komplette dokumentationspakke til Erhvervsstyrelsen:

| # | Dokument | Fil | Sprog | Linjer | Formål |
|---|----------|-----|-------|--------|--------|
| 1 | **Intern Kontrolrapport** | `docs/COMPLIANCE_REPORT.md` | Dansk | 1099 | Hoveddokument — beskriver systemets compliance med alle lovkrav |
| 2 | **Kryptografisk Sikkerhed** | `docs/ENCRYPTION.md` | Dansk | 630 | Teknisk dokumentation af kryptering, nøglehåndtering og sikkerhed |
| 3 | **Brugsvejledning** | `docs/BRUGSVEJLEDNING.md` | Dansk | 570 | Trin-for-trin guide til alle funktioner for slutbrugere |

### Dokumentbeskrivelse

#### 2.1 Intern Kontrolrapport (Hoveddokument)

Komprehensive rapport med 13 sektioner, der dokumenterer:

- **Systembeskrivelse:** Teknisk arkitektur, multi-tenant model, datamodel (23 modeller, 15 enums)
- **Organisatorisk forankring:** 5 roller, invitationssystem, tilsynsfunktion
- **Bogføringsmateriale:** Kontoplan, journalposter, fakturering, moms, bankafstemning
- **Intern kontrol:** Audit trail (13+ begivenhedstyper), dataintegritet, multi-tenant isolering
- **Kryptering:** AES-256-GCM, TLS 1.3, bcrypt, sessionsikkerhed
- **SAF-T eksport:** Format, indhold, validering (23+ kontroller)
- **OIOUBL fakturering:** UBL 2.1, Peppol BIS Billing 3.0, 4 fakturatyper
- **Backup og gendannelse:** 5 retention-niveauer, SHA-256 checksums, atomisk gendannelse
- **Adgangskontrol:** RBAC (5 roller, 23 tilladelser), 5-lags guard-kæde
- **Regnskabsperioder:** Åbne/lukkede perioder, årsafslutning
- **Compliance matrix:** 13/13 lovkrav opfyldt (10 Bogføringslov + 2 Digitalisering + 1 GDPR)

#### 2.2 Kryptografisk Sikkerhed (Teknisk Bilag)

Detaljeret teknisk dokumentation af:

- AES-256-GCM algoritme (256-bit nøgle, 96-bit IV, 128-bit auth tag)
- Lagringsformat (iv_base64:authTag_base64:ciphertext_base64)
- IV-håndtering (CSPRNG, aldrig genbrugt)
- Nøglehåndtering (miljøvariabel, aldrig i database/git)
- TLS 1.3 konfiguration (Caddy, Let's Encrypt, HSTS)
- Sikkerhedshoveder (X-Frame-Options, X-Content-Type-Options, HSTS)
- Databaseforbindelse (sslmode=require)
- Adgangskodesikkerhed (bcrypt, 12 salt-runder)
- Sessionsikkerhed (32-byte kryptografiske tokens)
- Nøglerotationsprocedure
- Compliance matrix med alle relevante paragraffer

#### 2.3 Brugsvejledning (Slutbrugerdokumentation)

Komplet brugermanual med 15 sektioner:

- Introduktion, roller og funktionsoversigt
- Kom i gang (konto, virksomhed, invitationer)
- Kontooversigt (FSR-standard kontoplan)
- Finansielle poster (journalposter, bilagsføring)
- Fakturering (salgsfaktura, kreditnota, OIOUBL)
- MOMS (10 momskoder, momsopgørelse)
- Bankafstemning (Open Banking, CSV-import)
- Periodeafslutning (lukning, årsafslutning)
- Rapportering (balance, resultat, momsrapport)
- SAF-T eksport med validering
- OIOUBL eksport (4 fakturatyper)
- Backup og gendannelse
- Bruger- og rollestyring (5 roller, 23 tilladelser)
- Sikkerhed (kryptering, sessions, audit trail)
- Support og kontakt

---

## 3. Forberedelse af Indsendelse

### 3.1 Forudsætninger

- [ ] Produktionsmiljø er live på alphaflow.dk med TLS 1.3
- [ ] Caddy reverse proxy er konfigureret med alle sikkerhedshoveder
- [ ] PostgreSQL database med sslmode=require
- [ ] ENCRYPTION_KEY er sat og sikret (secrets manager anbefalet)
- [ ] SMTP er konfigureret til e-mails
- [ ] Backup-system er aktiveret med korrekte retention-politikker

### 3.2 Teknisk Forberedelse

- [ ] Verificer at alle 89 API-ruter fungerer korrekt
- [ ] Test SAF-T eksport med reel virksomhedsdata
- [ ] Test OIOUBL eksport med faktura og kreditnota
- [ ] Verificer backup og gendannelse fungerer
- [ ] Test alle 5 roller (Owner, Admin, Accountant, Viewer, Auditor)
- [ ] Verificer audit trail logger alle begivenheder
- [ ] Test periodelukning og årsafslutning
- [ ] Kontroller at bankafstemning fungerer (demo-bank eller reel bank)

---

## 4. Dokument-Checkliste

### 4.1 Komplet Indsendelsespakke

| # | Element | Filnavn | Format | Status |
|---|---------|---------|--------|--------|
| 1 | Intern kontrolrapport | COMPLIANCE_REPORT.md | Markdown/PDF | [ ] Klar |
| 2 | Kryptografisk dokumentation | ENCRYPTION.md | Markdown/PDF | [ ] Klar |
| 3 | Brugsvejledning | BRUGSVEJLEDNING.md | Markdown/PDF | [ ] Klar |

### 4.2 Konvertering til PDF

Erhvervsstyrelsen modtager typisk dokumenter i PDF-format. Konverter markdown-filerne:

```bash
# Med pandoc (anbefalet)
pandoc docs/COMPLIANCE_REPORT.md -o docs/COMPLIANCE_REPORT.pdf --pdf-engine=weasyprint -V lang=da
pandoc docs/ENCRYPTION.md -o docs/ENCRYPTION.pdf --pdf-engine=weasyprint -V lang=da
pandoc docs/BRUGSVEJLEDNING.md -o docs/BRUGSVEJLEDNING.pdf --pdf-engine=weasyprint -V lang=da

# Alternativ med wkhtmltopdf
pandoc docs/COMPLIANCE_REPORT.md -o docs/COMPLIANCE_REPORT.html -s --metadata lang=da
wkhtmltopdf docs/COMPLIANCE_REPORT.html docs/COMPLIANCE_REPORT.pdf
```

### 4.3 Dokumentkvalitet

| Kriterie | Status |
|----------|--------|
| Alle dokumenter er på dansk | [ ] Bekræftet |
| Konsistente tekniske data på tværs af dokumenter | [ ] Bekræftet |
| Alle lovreferencer er korrekte (paragraf-numre) | [ ] Bekræftet |
| Alle filstier er korrekte | [ ] Bekræftet |
| Compliance matrix er komplet (13/13 opfyldt) | [ ] Bekræftet |
| Dokumentversioner og datoer er opdateret | [ ] Bekræftet |

---

## 5. Teknisk Verifikation

### 5.1 Kryptering

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| ENCRYPTION_KEY er 64 hex-tegn (256 bit) | ✅ | [ ] |
| AES-256-GCM krypterer bank-tokens korrekt | ✅ | [ ] |
| Decryption virker med korrekt nøgle | ✅ | [ ] |
| Decryption fejler med forkert nøgle | ✅ | [ ] |
| Legacy base64-tokens kan læses (bagudkompatibilitet) | ✅ | [ ] |
| Krypterede data kan ikke læses i database | ✅ | [ ] |

### 5.2 TLS og Sikkerhed

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| TLS 1.3 er aktiv på alphaflow.dk | ✅ | [ ] |
| HSTS header er sat (max-age=31536000) | ✅ | [ ] |
| X-Frame-Options: DENY | ✅ | [ ] |
| X-Content-Type-Options: nosniff | ✅ | [ ] |
| HTTP→HTTPS omdirigering fungerer | ✅ | [ ] |

### 5.3 Adgangskontrol

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| 5 roller fungerer korrekt | ✅ | [ ] |
| 23 tilladelser håndhæves korrekt | ✅ | [ ] |
| Seer kan ikke oprette data | ✅ | [ ] |
| Revisor kan eksportere SAF-T | ✅ | [ ] |
| Owner kan slette virksomhed | ✅ | [ ] |
| Tilsynsfunktion er skrivebeskyttet | ✅ | [ ] |

### 5.4 Bogføring

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| Dobbelt bogføring (debet = kredit) | ✅ | [ ] |
| Kladde → Bogført workflow | ✅ | [ ] |
| Annullering opretter modpost | ✅ | [ ] |
| Bilagsføring fungerer | ✅ | [ ] |
| Periode lukning forhindrer nye poster | ✅ | [ ] |
| Årsafslutning overfører resultat | ✅ | [ ] |

### 5.5 Eksport

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| SAF-T eksport genererer gyldig XML | ✅ | [ ] |
| SAF-T indeholder reelle kundedata | ✅ | [ ] |
| SAF-T validering (23+ kontroller) | ✅ | [ ] |
| OIOUBL eksport genererer gyldig XML | ✅ | [ ] |
| OIOUBL kreditnota (InvoiceTypeCode 381) | ✅ | [ ] |
| OIOUBL validering (11 kategorier) | ✅ | [ ] |

### 5.6 Backup

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| Automatisk backup er planlagt | ✅ | [ ] |
| SHA-256 checksum genereres | ✅ | [ ] |
| Gendannelse opretter sikkerhedskopi | ✅ | [ ] |
| Atomisk rollback ved fejl | ✅ | [ ] |
| 60 måneders retention for månedlig backup | ✅ | [ ] |

### 5.7 Audit Trail

| Kontrol | Forventet resultat | Status |
|---------|-------------------|--------|
| Alle mutationer logges | ✅ | [ ] |
| Login/logout logges | ✅ | [ ] |
| Backup-handlinger logges | ✅ | [ ] |
| Audit-log kan ikke slettes/redigeres | ✅ | [ ] |
| Tidsstempler og IP-adresse registreres | ✅ | [ ] |

---

## 6. Compliance-Dækning

### 6.1 Lovkrav — Bogføringsloven

| Paragraf | Krav | Dokumenteret i | Status |
|----------|------|---------------|--------|
| § 1 stk. 1 | Bogføring af alle transaktioner | Kontrolrapport § 4.1-4.3 | ✅ |
| § 4 stk. 1 | Betryggende opbevaring | Kontrolrapport § 6, ENCRYPTION.md | ✅ |
| § 4 stk. 2 | Uforkortethed og integritet | Kontrolrapport § 5.4, ENCRYPTION.md § 3.3 | ✅ |
| § 4 stk. 3 | Dokumentationens indhold og sammenhæng | Kontrolrapport § 5.3.4 | ✅ |
| § 5 | Hurtig fremskaffelse | Kontrolrapport § 4.9, § 7, § 8 | ✅ |
| § 10 stk. 1 | Fuldstændig, ægte, pålidelig dokumentation | Kontrolrapport § 5.3 | ✅ |
| § 11 stk. 1 | Adgang begrænset til autoriserede | Kontrolrapport § 10 | ✅ |
| § 11 stk. 2 | Adgangskontrol med logning | Kontrolrapport § 6.4, § 10.5 | ✅ |
| § 12 | Elektronisk materiale kan aflæses | Kontrolrapport § 4.9, Brugsvejledning § 9-11 | ✅ |
| § 15 stk. 1 | 5 års opbevaring | Kontrolrapport § 9.1, § 9.6 | ✅ |

### 6.2 Lovkrav — Digitaliseringsbekendtgørelsen

| Paragraf | Krav | Dokumenteret i | Status |
|----------|------|---------------|--------|
| § 8 stk. 1 | Tilgængelighed i opbevaringsperioden | Kontrolrapport § 6, § 9 | ✅ |
| § 8 stk. 2 | Tilstrækkelig sikkerhed | Kontrolrapport § 6, ENCRYPTION.md | ✅ |

### 6.3 Lovkrav — GDPR

| Artikel | Krav | Dokumenteret i | Status |
|---------|------|---------------|--------|
| Art. 32 stk. 1 | Sikkerhed for behandling | Kontrolrapport § 6, ENCRYPTION.md | ✅ |

### 6.4 Samlet Status

| Lovgivning | Krav | Opfyldt |
|-----------|------|---------|
| Bogføringsloven | 10 | 10/10 ✅ |
| Digitaliseringsbekendtgørelsen | 2 | 2/2 ✅ |
| GDPR | 1 | 1/1 ✅ |
| **Total** | **13** | **13/13 ✅** |

---

## 7. Indsendelsesproces

### 7.1 Indsendelseskanaler

Indsendelse til Erhvervsstyrelsen kan typisk ske via:

| Kanal | Beskrivelse | URL |
|-------|-------------|-----|
| **Virk.dk** | Digital selvbetjening | https://indberet.virk.dk |
| **E-mail** | Direkte til relevant afdeling | Se Erhvervsstyrelsens kontakt side |
| **NemVirksomhed** | Erhvervsservice | https://portal.nemvirksomhed.dk |

### 7.2 Indsendelsessteps

1. **Konverter dokumenter til PDF**
   - Se afsnit 4.2 for konverteringsinstruktioner

2. **Forbered ansøgningsformular**
   - Virksomhedsoplysninger (navn, CVR, adresse)
   - Systembeskrivelse (kort oversigt)
   - Teknisk kontaktperson
   - Dato for systemets ibrugtagning

3. **Upload dokumentation**
   - Intern kontrolrapport (COMPLIANCE_REPORT.pdf)
   - Kryptografisk dokumentation (ENCRYPTION.pdf)
   - Brugsvejledning (BRUGSVEJLEDNING.pdf)

4. **Bekræft indsendelse**
   - Gem kvittering/referencenummer
   - Notér forventet sagsbehandlingstid

### 7.3 Supplerende Dokumentation (valgfrit)

Følgende dokumenter kan med fordel inkluderes som supplerende materiale:

| Dokument | Beskrivelse |
|----------|-------------|
| Kildekode-udtræk (`src/lib/crypto.ts`, `src/lib/rbac.ts`, `src/lib/audit.ts`) | Demonstrerer implementering |
| Prisma-skema (`prisma/schema.prisma`) | Dokumenterer datamodel |
| Caddy-konfiguration (`Caddyfile`) | Dokumenterer TLS/sikkerhed |
| Systemarkitektur-diagram | Viser overordnet arkitektur |
| Testresultater | Verifikation af sikkerhed og funktioner |

---

## 8. Efter Indsendelse

### 8.1 Sagsbehandling

- **Forventet sagsbehandlingstid:** Varierer — typisk 2-8 uger
- **Kommunikation:** Erhvervsstyrelsen kan anmode om supplerende oplysninger
- **Follow-up:** Følg op inden for 4 uger, hvis der ikke er modtaget kvittering

### 8.2 Mulige Følgespørgsmål fra Erhvervsstyrelsen

| Spørgsmål | Forberedelse |
|-----------|-------------|
| Hvor er data fysisk placeret? | Neon PostgreSQL (EU/USA region), specificer region |
| Hvordan håndteres nøglerotation? | Se ENCRYPTION.md § 8.5 — detaljeret procedure |
| Hvordan testes backup-gendannelse? | Testresultater med checksum-verifikation |
| Kan systemet demonstreres? | Tilbyd demo via alphaflow.dk (demo-virksomhed) |
| Hvordan håndteres GDPR-anmodninger? | Se kontrolrapport § 3.1, audit trail |
| Hvad sker der ved nedetid? | PM2 auto-restart, backup-system, data-integritet |

### 8.3 Opdatering af Dokumentation

Ved systemopdateringer der påvirker compliance:

1. Opdater de berørte dokumenter (COMPLIANCE_REPORT.md, ENCRYPTION.md, BRUGSVEJLEDNING.md)
2. Øg dokumentversion
3. Opdater revisionsdato
4. Gem tidligere versioner som reference
5. Indsend opdateret dokumentation til Erhvervsstyrelsen ved væsentlige ændringer

### 8.4 Løbende Compliance

| Aktivitet | Hyppighed | Ansvarlig |
|-----------|-----------|-----------|
| Verificer backup-funktion | Månedligt | Systemadministrator |
| Test gendannelse | Kvartalsvis | Systemadministrator |
| Opdater compliance-dokumenter | Ved ændringer | Systemudvikler |
| Kontroller lovændringer | Årligt | Systemejer |
| Verificer certifikatfornyelse | Årligt | Systemadministrator |
| Gennemgå audit trail | Årligt | Systemejer / Revisor |

---

## 9. Referencer

### 9.1 Lovgivning

| Referencer | URL |
|-----------|-----|
| Bogføringsloven (LBK nr. 1316 af 14/08/2023) | https://www.retsinformation.dk/eli/lta/2023/1316 |
| Digitaliseringsbekendtgørelsen | https://www.retsinformation.dk |
| GDPR (EU 2016/679) | https://eur-lex.europa.eu/eli/reg/2016/679/oj |

### 9.2 Tekniske Standarder

| Standard | Beskrivelse |
|----------|-------------|
| SAF-T Financial DK v1.0 | Standardformat for regnskabsdata (OECD) |
| UBL 2.1 | Universal Business Language |
| Peppol BIS Billing 3.0 | Europæisk e-fakturastandard |
| AES-256-GCM | NIST SP 800-38D |
| TLS 1.3 | IETF RFC 8446 |
| bcrypt | IETF RFC 2898 (PBKDF2-baseret) |

### 9.3 AlphaFlow Dokumenter

| Dokument | Sti |
|----------|------|
| Intern kontrolrapport | `docs/COMPLIANCE_REPORT.md` |
| Kryptografisk dokumentation | `docs/ENCRYPTION.md` |
| Brugsvejledning | `docs/BRUGSVEJLEDNING.md` |
| Multi-tenant implementering | `docs/MULTI_TENANT_PLAN.md` |
| Projekt-README | `README.md` |
| Opsætningsguide | `STARTUP.md` |

---

*Dette dokument udgør AlphaFlows indsendelsesguide til Erhvervsstyrelsen. Guiden er udarbejdet som en supplement til den interne kontrolrapport og skal sikre, at indsendelsen er komplet og velstruktureret.*

*Alle oplysninger er baseret på den faktiske systemimplementering og er konsistente med kontrolrapporten (docs/COMPLIANCE_REPORT.md) og den tekniske sikkerhedsdokumentation (docs/ENCRYPTION.md).*
