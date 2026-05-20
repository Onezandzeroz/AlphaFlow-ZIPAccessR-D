'use client';

import { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { ArrowLeft, Languages, Scale, ChevronRight, Shield, FileText, Building2, CreditCard, Lock, Database, Copyright, AlertTriangle, Gavel, Mail, CalendarDays, ExternalLink, Phone, Package, RotateCcw, MessageSquareWarning } from 'lucide-react';

// ─── Types ───

type Language = 'da' | 'en';

interface SectionItem {
  id: string;
  icon: React.ReactNode;
  title: { da: string; en: string };
}

interface LegalContent {
  title: string;
  lastUpdated: string;
  tocLabel: string;
  backLabel: string;
  sections: {
    id: string;
    title: string;
    content: string;
  }[];
  contact: {
    heading: string;
    company: string;
    address: string;
    cvr: string;
    email: string;
    website: string;
    phone: string;
  };
  footerText: string;
}

// ─── Table of contents definition ───

const TOC_ITEMS: SectionItem[] = [
  { id: 'section-1', icon: <Scale className="h-4 w-4" />, title: { da: 'Generelle betingelser', en: 'General Terms' } },
  { id: 'section-2', icon: <FileText className="h-4 w-4" />, title: { da: 'Tjenesten', en: 'The Service' } },
  { id: 'section-3', icon: <Package className="h-4 w-4" />, title: { da: 'Levering', en: 'Delivery' } },
  { id: 'section-4', icon: <RotateCcw className="h-4 w-4" />, title: { da: 'Forbrugerens fortrydelsesret', en: 'Consumer\'s Right of Withdrawal' } },
  { id: 'section-5', icon: <CreditCard className="h-4 w-4" />, title: { da: 'Returnerings- og refusionspolitik', en: 'Return & Refund Policy' } },
  { id: 'section-6', icon: <CreditCard className="h-4 w-4" />, title: { da: 'Abonnement og betaling', en: 'Subscription and Payment' } },
  { id: 'section-7', icon: <Building2 className="h-4 w-4" />, title: { da: 'Brugerens forpligtelser', en: 'User Obligations' } },
  { id: 'section-8', icon: <Shield className="h-4 w-4" />, title: { da: 'Databeskyttelse og GDPR', en: 'Data Protection and GDPR' } },
  { id: 'section-9', icon: <Copyright className="h-4 w-4" />, title: { da: 'Immaterielle rettigheder', en: 'Intellectual Property' } },
  { id: 'section-10', icon: <AlertTriangle className="h-4 w-4" />, title: { da: 'Ansvarsbegrænsning', en: 'Limitation of Liability' } },
  { id: 'section-11', icon: <Database className="h-4 w-4" />, title: { da: 'Opbevaring af data', en: 'Data Retention' } },
  { id: 'section-12', icon: <FileText className="h-4 w-4" />, title: { da: 'Opsigelse', en: 'Termination' } },
  { id: 'section-13', icon: <MessageSquareWarning className="h-4 w-4" />, title: { da: 'Klageprocedure', en: 'Complaint Handling Procedure' } },
  { id: 'section-14', icon: <Gavel className="h-4 w-4" />, title: { da: 'Ændringer af vilkår', en: 'Changes to Terms' } },
  { id: 'section-15', icon: <Scale className="h-4 w-4" />, title: { da: 'Tvistløsning og værneting', en: 'Dispute Resolution and Jurisdiction' } },
  { id: 'section-16', icon: <Mail className="h-4 w-4" />, title: { da: 'Kontaktoplysninger', en: 'Contact Information' } },
];

// ─── Danish content ───

const DA_CONTENT: LegalContent = {
  title: 'Forretningsbetingelser',
  lastUpdated: '1. juli 2025',
  tocLabel: 'Indholdsfortegnelse',
  backLabel: 'Tilbage',

  sections: [
    {
      id: 'section-1',
      title: '1. Generelle betingelser',
      content: `Disse Forretningsbetingelser ("Vilkårene") regulerer brugeren ("Kunden", "dig", "dine") adgang til og brug af AlphaFlow-tjenesten leveret af AlphaAI Consult ApS ("vi", "os", "vores").

Ved at oprette en konto hos AlphaFlow accepterer du disse Vilkår i deres helhed. Vilkårene udgør en bindende aftale mellem dig og AlphaAI Consult ApS i overensstemmelse med dansk ret, jf. Forbrugeraftaleloven (LBKG lovbekendtgørelse nr. 1079 af 27. august 2021) og Markedsføringsloven (LBK nr. 954 af 29. juni 2023).

AlphaAI Consult ApS er fuldt ejet af AlphaCloud Holding ApS.

AlphaAI Consult ApS er registreret i Erhvervs- og Selskabsstyrelsens CVR-register. Se afsnit 16 for kontaktoplysninger.

Disse Vilkår gælder for alle brugere, uanset om de anvender AlphaFlow som forbruger eller erhvervsdrivende. For erhvervskunder gælder desuden yderligere bestemmelser om data og ansvar jf. afsnit 10.

AlphaFlow forbeholder sig retten til at opdatere disse Vilkår jf. afsnit 14. Vi opfordrer dig til løbende at gøre dig bekendt med Vilkårenes indhold.`,
    },
    {
      id: 'section-2',
      title: '2. Tjenesten',
      content: `AlphaFlow er en cloud-baseret regnskabsplatform for danske virksomheder, der kombinerer deterministisk, regelbaseret software med kunstig intelligens (AI) til dokumenthåndtering og workflow-optimering.

Vigtigt om AI og regnskab: Ingen af AlphaFlows kernefunktioner inden for regnskab og bogføring udføres af AI. Alle regnskabsmæssige beregninger — herunder dobbelt bogføring, modpostering, momsudregning, momsafstemning, finansielle rapporter og årsafslutning — udføres udelukkende af deterministisk, regelbaseret software. Dette er bevidst valgt, da AI (herunder Large Language Models) har en ikke-deterministisk natur, hvor resultater kan variere for samme input. En sådan usikkerhed er ikke forenelig med de præcisionskrav, der gælder for regnskab og bogføring, hvor tal har et entydigt facit.

Tjenesten omfatter følgende kernefunktionaliteter:
- Automatisk OCR-scanning af bilag og kvitteringer (AI-understøttet)
- Regelbaseret bogføring med automatisk modpostering og finanskontoforslag
- AI-assisteret kategorisering af bilag som tidsbesparende forslag (altid med brugerens endelige godkendelse)
- Oprettelse, afsendelse og håndtering af fakturaer (inkl. EAN-fakturering)
- Bankafstemning via Open Banking PSD2-integration
- Momsafstemning og generering af momsopgørelser til SKAT
- Årsafslutning og finansrapportering
- Kontakt- og debitorstyring
- Backup og eksport af regnskabsdata (SAF-T, CSV, PDF)

AI anvendes udelukkende som tidsbesparende supplement til administrative opgaver, såsom genkendelse og kategorisering af bilag. AlphaFlow anvender maskinlæring til at forbedre kategoriseringsnøjagtigheden over tid. Alle AI-baserede forslag er netop det — forslag — og skal altid verificeres og godkendes af brugeren, før de påvirker regnskabet.

Tjenesten leveres som en Software-as-a-Service (SaaS) og er tilgængelig via webbrowser og mobilapplikation. AlphaFlow tilstræber en oppetid på minimum 99,5 %, men kan ikke garantere uafbrudt adgang. Planlagte vedligeholdelsesvinduer annonceres i forvejen via tjenesten og/eller e-mail.

Vi forbeholder os retten til midlertidigt at begrænse eller suspendere adgangen til Tjenesten ved mistanke om misbrug, sikkerhedsbrister eller lovkrav, jf. Elektronisk Handelsloven (LBK nr. 384 af 13. maj 2022).`,
    },
    {
      id: 'section-3',
      title: '3. Levering',
      content: `AlphaFlow er en digital tjeneste, der leveres som Software-as-a-Service (SaaS) via internettet.

a) Straks levering: AlphaFlow leveres øjeblikkeligt efter gennemført betaling og kontooprettelse. Du får straks adgang til Tjenesten via vores webplatform på www.alphaflow.dk.

b) Aktiveringsproces: For at aktivere Tjenesten skal du:
  1. Oprette en konto med gyldige virksomhedsoplysninger
  2. Bekræfte din e-mailadresse via verifikationslink
  3. Vælge en abonnementsplan og gennemføre betaling
Efter fuldførelse af disse trin er Tjenesten straks tilgængelig.

c) Leveringsmetode: Tjenesten leveres udelukkende digitalt via cloud-infrastruktur og er tilgængelig gennem en webbrowser. Der foretages ingen fysisk levering.

d) Digital levering: Ved at gennemføre købet anerkender du, at levering af den digitale tjeneste påbegyndes straks efter betaling, og at du dermed mister din fortrydelsesret, jf. Forbrugeraftaleloven § 18b, stk. 2. Dette gælder, forudsat at AlphaAI Consult ApS har opfyldt sin oplysningspligt og du udtrykkeligt har accepteret, at leveringen påbegyndes inden for fortrydelsesfristen.

e) Adgang og tilgængelighed: AlphaFlow bestræber sig på at sikre uafbrudt adgang til Tjenesten. Planlagte vedligeholdelsesvinduer annonceres i forvejen. AlphaFlow kan ikke garantere, at Tjenesten er tilgængelig til enhver tid.`,
    },
    {
      id: 'section-4',
      title: '4. Forbrugerens fortrydelsesret',
      content: `Som forbruger har du ret til at fortryde dit køb af AlphaFlow inden for 14 dage efter indgåelsen af aftalen, jf. Forbrugeraftaleloven § 18.

a) Fortrydelsesfristen: Fortrydelsesfristen løber fra den dag, aftalen blev indgået. Hvis fristen udløber på en helligdag, lørdag eller søndag, forlænges fristen til den følgende hverdag.

b) Undtagelse for digitale tjenester: Fortrydelsesretten bortfalder, hvis leveringen af den digitale tjeneste er påbegyndt med dit forudgående samtykke og din anerkendelse af, at du derved mister din fortrydelsesret, jf. Forbrugeraftaleloven § 18b. Dette gælder for AlphaFlow, da tjenesten leveres øjeblikkeligt efter betaling, og du udtrykkeligt accepterer, at leveringen påbegyndes inden for fortrydelsesfristen.

c) Hvordan du fortryder: Hvis du ønsker at udøve din fortrydelsesret, skal du sende en utvetydig erklæring via e-mail til:

AlphaAI Consult ApS
E-mail: alphaaiconsult@gmail.com

Du kan også benytte nedenstående standardfortrydelsesformular.

d) Standardfortrydelsesformular:
"[Dette er kun en standardformular]

Jeg/vi (*) meddeler herved, at jeg/vi (*) fortryder min/vores (*) aftale om køb af følgende tjenester (*):

Bestilt den (*)/modtaget den (*):
Forbrugerens navn:
Forbrugerens adresse:
Dato:

(*) Slet det, der ikke er relevant."

e) Tilbagebetaling: Hvis du fortryder dit køb, refunderer vi alle betalinger modtaget fra dig, herunder leveringsomkostninger, uden unødigt ophold og senest 14 dage efter den dag, vi har modtaget din meddelelse om fortrydelse. Tilbagebetaling sker via samme betalingsmiddel, som du benyttede ved det oprindelige køb.

f) Bevis for fortrydelse: Det er dit ansvar at påvise, at du har udnyttet fortrydelsesretten. Opbevar derfor kvittering for e-mail eller anden bekræftelse.`,
    },
    {
      id: 'section-5',
      title: '5. Returnerings- og refusionspolitik',
      content: `Da AlphaFlow er en digital SaaS-tjeneste, er der ingen fysisk returnering mulig.

a) Digital tjeneste: AlphaFlow leveres som en digital tjeneste og kan ikke returneres på traditionel vis. Ved opsigelse af abonnementet ophører din adgang til Tjenesten.

b) Refusion for ubrugte perioder: For månedlige abonnementer refunderes ikke betaling for den aktuelle faktureringsperiode, da tjenesten er fuldt tilgængelig gennem hele perioden. For årlige abonnementer kan der, under særlige omstændigheder, ansøges om forholdsmæssig refusion for resterende perioder ved skriftlig henvendelse til alphaaiconsult@gmail.com. Hvert tilfælde vurderes individuelt.

c) Refusionsbehandling: Hvis en refusion godkendes, behandles den inden for 14 dage. Refusionen tilbagebetales via samme betalingsmiddel, som blev anvendt ved det oprindelige køb.

d) Klage over refusion: Hvis du er uenig i en afgørelse om refusion, kan du indgive en klage jf. afsnit 13 (Klageprocedure).`,
    },
    {
      id: 'section-6',
      title: '6. Abonnement og betaling',
      content: `AlphaFlow tilbydes i flere abonnementsplaner med varierende funktionalitet og brugergrænser. Gældende priser, planer og vilkår fremgår af vores hjemmeside på tidspunktet for tilmeldingen.

Den minimale abonnementsperiode er 1 måned. Abonnementet fornyes automatisk med den valgte faktureringsperiode.

Du kan opsige eller ændre dit abonnement til enhver tid via indstillingerne i Tjenesten. Ved opsigelse bevarer du adgang til Tjenesten indtil udgangen af den aktuelle faktureringsperiode.

Alle priser er angivet i danske kroner (kr./DKK) og er eksklusive moms. Moms tilkommer med den til enhver tid gældende sats (aktuelt 25 %) og fremgår separat på fakturaen, i overensstemmelse med Momsloven (LBK nr. 1061 af 29. august 2023) og Fakturaloven (LBK nr. 1041 af 27. august 2021).

Betaling foregår via det betalingsmiddel, som Kunden har oplyst ved tilmeldingen (kreditkort, MobilePay eller bankoverførsel). Betalingen trækkes automatisk på fornyelsesdatoen. Ved betalingsmisligholdelse er AlphaFlow berettiget til at suspendere adgangen til Tjenesten efter skriftligt varsel med 14 dages frist til betaling.

AlphaFlow forbeholder sig retten til at ændre priserne med 30 dages forudgående skriftligt varsel (via e-mail og/eller meddelelse i Tjenesten). Forbrugere har ret til at opsige abonnementet uden omkostninger ved prisstigninger, jf. Forbrugeraftalelovens § 18.

Ved opgradering til en højere abonnementsplan beregnes der forholdsmæssigt differencen for den resterende periode. Ved nedgradering træder ændringen i kraft ved næste fornyelsesdato.

Fakturering sker automatisk i forbindelse med fornyelsen af abonnementet.`,
    },
    {
      id: 'section-7',
      title: '7. Brugerens forpligtelser',
      content: `Som bruger af AlphaFlow påtager du dig følgende forpligtelser:

a) Korrekte oplysninger: Du skal opgive sande, fuldstændige og ajourførte oplysninger ved oprettelse og vedligeholdelse af din konto, herunder virksomhedens navn, adresse, CVR-nummer og kontaktoplysninger. Ændringer skal straks meddeles AlphaFlow.

b) Sikkerhed: Du er ansvarlig for fortroligheden af dine login-oplysninger og for al aktivitet, der finder sted på din konto. Du skal vælge et stærkt password og holde det hemmeligt. Ved mistanke om uautoriseret adgang skal du straks underrette AlphaFlow og ændre dit password.

c) Lovlig brug: Du må kun anvende AlphaFlow til lovlige formål i overensstemmelse med gældende dansk lovgivning, herunder Bogføringsloven (LBK nr. 1320 af 14. november 2023) og Skattekontrolloven. Brugere skal sikre, at deres regnskabsførelse overholder danske bogføringskrav.

d) AI-assistenter: AlphaFlows AI-funktioner anvendes udelukkende som tidsbesparende forslag til administrative opgaver (f.eks. kategorisering af bilag). AI deltager ikke i udførelsen af nogen regnskabsmæssige eller bogføringsmæssige beregninger — alle sådanne funktioner udføres af deterministisk software jf. afsnit 2. Brugeren bærer det endelige ansvar for, at bogføringen er korrekt og i overensstemmelse med gældende lovgivning, herunder ved godkendelse af AI-genererede forslag.

e) Backup: Selvom AlphaFlow tilbyder backup-funktionalitet, anbefales det, at brugeren regelmæssigt tager uafhængige sikkerhedskopier af vigtige regnskabsdata.

f) Alderskrav: Brug af AlphaFlow kræver, at brugeren er myndig (mindst 18 år) og har beføjelse til at indgå aftaler på vegne af den registrerede virksomhed.

Overtrædelse af disse forpligtelser kan medføre suspension eller lukning af kontoen.`,
    },
    {
      id: 'section-8',
      title: '8. Databeskyttelse og GDPR',
      content: `AlphaFlow behandler personoplysninger i overensstemmelse med EU's Databeskyttelsesforordning (GDPR — Forordning (EU) 2016/679) og den danske Databeskyttelsesloven (LBK nr. 934 af 28. juni 2023).

Vi er dataansvarlige for de personoplysninger, du afgiver i forbindelse med brugen af Tjenesten. Vores datapolitik, som udgør en separat aftale, beskriver i detaljer, hvordan vi behandler dine oplysninger.

Som registreret har du følgende rettigheder i henhold til GDPR artikel 12–22:
- Ret til indsigt i dine personoplysninger (art. 15)
- Ret til berigtigelse af unøjagtige oplysninger (art. 16)
- Ret til sletning ("retten til at blive glemt") (art. 17)
- Ret til begrænsning af behandling (art. 18)
- Ret til dataportabilitet (art. 20)
- Ret til indsigelse mod behandling (art. 21)

Anmodninger om udøvelse af dine rettigheder kan rettes til vores datalogansvarlige via e-mail: alphaaiconsult@gmail.com. Vi svarer på anmodninger inden 30 dage jf. GDPR artikel 12.

For erhvervskunder indgås en databehandleraftale (DPA — Data Processing Agreement) i overensstemmelse med GDPR artikel 28. Aftalen sendes automatisk ved oprettelse og kan tilgås via indstillingerne i Tjenesten.

Data overføres til og opbevares på servere inden for EU/EØS. I begrænsede tilfælde kan data blive overført til tredjelande med tilstrækkeligt beskyttelsesniveau i henhold til GDPR Kapitel V.

AlphaFlow har anmeldt behandlingen af personoplysninger til Datatilsynet. Vores CVR-nummer findes i afsnit 16.`,
    },
    {
      id: 'section-9',
      title: '9. Immaterielle rettigheder',
      content: `Alle immaterielle rettigheder til AlphaFlow-tjenesten — herunder software, design, grafik, logoer, tekster, databaser, AI-modeller (til dokumentgenkendelse og kategorisering) og dokumentation — tilhører AlphaAI Consult ApS eller vores licensgivere.

Dette gælder i overensstemmelse med Ophavsretsloven (LBK nr. 935 af 28. juni 2023) og relevant EU-lovgivning om immaterielle rettigheder.

Du tildeles en begrænset, ikke-eksklusiv, ikke-overdragelig og tilbagekaldelig licens til at bruge AlphaFlow i overensstemmelse med disse Vilkår og dit valgte abonnement. Licensen gælder udelukkende til internt brug i din egen virksomhed.

Det er ikke tilladt at:
- Reverse-engineere, dekompilere eller disassemblere AlphaFlows software
- Kopiere, modificere eller distribuere dele af Tjenesten
- Benytte AlphaFlows navn, logo eller varemærker uden forudgående skriftligt samtykke
- Anvende automatiserede værktøjer (bots, scrapers) til at tilgå Tjenesten
- Sælge, leje eller underlicensere adgangen til Tjenesten

Brugere bevarer fulde rettigheder til de data og dokumenter, de uploader til AlphaFlow. AlphaFlow påtager sig ingen rettigheder til brugernes forretningsdata, udover det der er nødvendigt for at levere Tjenesten.

AI-genererede kategoriseringsforslag til bilag er baseret på AlphaFlows proprietære modeller og udgør AlphaFlows immaterielle rettighed. Disse forslag vedrører udelukkende dokumenthåndtering og påvirker ikke regnskabsmæssige beregninger, der udføres af særskilt deterministisk software jf. afsnit 2.`,
    },
    {
      id: 'section-10',
      title: '10. Ansvarsbegrænsning',
      content: `AlphaFlows ansvar er underlagt dansk rets almindelige regler om kontraktsansvar, herunder Erhvervs- og Selskabsstyrelsens regler om SaaS-tjenester.

a) Erstatningsansvar: AlphaFlows samlede erstatningsansvar over for Kunden — uanset årsag (herunder fejlagtige kategoriseringsforslag fra AI, systemnedetid, datafejl eller andre direkte skader) — er begrænset til det beløb, Kunden har betalt til AlphaFlow for abonnementet i de 12 måneder forud for det begivenhedsforløb, der udløste kravet. Dette gælder ikke i tilfælde af grov uagtsomhed eller forsæt. Bemærk, at AI ikke anvendes til regnskabsmæssige beregninger jf. afsnit 2.

b) Indirekte skader: AlphaFlow er under ingen omstændigheder ansvarlig for indirekte skader, herunder — men ikke begrænset til — tabt fortjeneste, forventede besparelser, driftstab, avancetab, goodwill-tab eller forretningsafbrydelse.

c) Ingen rådgivning: AlphaFlow er et regnskabsværktøj og udgør ikke finansielt, skattemæssigt eller juridisk rådgivning. Regnskabsmæssige beregninger i AlphaFlow udføres af deterministisk, regelbaseret software, ikke af AI jf. afsnit 2. Brugeren bærer det fulde ansvar for beslutninger truffet på baggrund af data fra Tjenesten.

d) Tredjepartstjenester: AlphaFlow integrerer med eksterne tjenester (banker, betalingsudbydere, Open Banking). Vi kan ikke holdes ansvarlig for forsinkelser, fejl eller afbrydelser forårsaget af disse tredjepartstjenester.

f) Force majeure: AlphaFlow er fritaget for ansvar ved force majeure-hændelser, herunder naturkatastrofer, krig, terrorisme, pandemi, offentlige myndigheders indgreb, strømafbrydelse eller cyberangreb, der ligger uden for vores rimelige kontrol.

Begrænsningerne i dette afsnit gælder i det omfang, de er tilladt efter dansk ret, jf. Forbrugeraftalelovens § 34–35. Forbrugere kan ikke fraskrive sig rettigheder, der følger af ufravigelig lovgivning.`,
    },
    {
      id: 'section-11',
      title: '11. Opbevaring af data',
      content: `AlphaFlow opbevarer brugernes data i overensstemmelse med dansk lovgivning, herunder Bogføringslovens krav om 5 års opbevaring af regnskabsmateriale.

a) Regnskabsdata: Al bogføringsmæssig data opbevares i minimum 5 år fra udgangen af det regnskabsår, hvortil dataen relaterer sig, jf. Bogføringslovens § 10. Opbevaringsperioden kan forlænges, hvis det kræves af skattemyndighederne.

b) Bilag og dokumenter: Uploadede bilag, fakturaer og dokumenter opbevares i samme periode som den tilknyttede regnskabsdata. Billedfiler komprimeres og opbevares sikkert på krypterede servere.

c) Brugerdata: Kontooplysninger, præferencer og aktivitetslogs opbevares, så længe kontoen er aktiv. Efter sletning af konto anonymiseres personrelaterede data inden for 30 dage, medmindre lovgivning kræver længere opbevaring.

d) Sikkerhed: Alle data krypteres under transmission (TLS 1.3) og under opbevaring (AES-256). AlphaFlow udfører regelmæssige sikkerhedsrevisioner og penetrationstests.

e) Backup: Data tages backup af dagligt og gemmes på geografisk adskilte servere inden for EU/EØS. Backups opbevares i 30 dage.

f) Eksport: Brugere kan til enhver tid eksportere deres data via Tjenestens eksportfunktioner (SAF-T, CSV, PDF). AlphaFlow leverer data på anmodning inden for rimelig tid ved opsigelse.

g) Sletning: Ved opsigelse opbevares regnskabsdata i lovens krævede periode. Efter udløbet af opbevaringsperioden slettes data permanent, medmindre andet er aftalt eller krævet ved lov.`,
    },
    {
      id: 'section-12',
      title: '12. Opsigelse',
      content: `a) Opsigelse fra kunden: Du kan opsige dit abonnement til enhver tid via indstillingerne i Tjenesten eller ved at kontakte vores kundeservice. Opsigelsen træder i kraft ved udgangen af den aktuelle faktureringsperiode. Der er ingen binding ud over den løbende periode.

b) Opsigelse fra AlphaFlow: AlphaFlow kan opsige abonnementet med 30 dages skriftligt varsel. Ved grove misligholdelser af Vilkårene kan opsigelsen ske med øjeblikkelig virkning.

c) Efter opsigelse: Ved opsigelse beholdes din konto og data tilgængelig i 30 dage, hvorefter de overgår til arkivtilstand. Regnskabsdata opbevares som angivet i afsnit 11.

d) Gebyrer: Der opkræves ikke opsigelsesgebyrer. For årlige abonnementer refunderes ikke det forudbetalte beløb for den resterende periode ved opsigelse før tid, medmindre andet er angivet i den specifikke aftale.

e) Overførsel af data: AlphaFlow hjælper med at eksportere dine data ved opsigelse. Vi tilbyder eksport i standardiserede formater (SAF-T, CSV, PDF), der kan importeres i andre regnskabssystemer.`,
    },
    {
      id: 'section-13',
      title: '13. Klageprocedure',
      content: `Vi ønsker at sikre, at du er tilfreds med AlphaFlow. Hvis du har en klage, bedes du følge nedenstående procedure:

a) Trin 1 — Kontakt os: Henvend dig til vores kundeservice via e-mail (alphaaiconsult@gmail.com) eller pr. telefon (se Kontaktoplysninger). Beskriv klagen så detaljeret som muligt, herunder dit navn, CVR-nummer og en beskrivelse af problemet. Vi bestræber os på at besvare henvendelser inden for 2 hverdage.

b) Trin 2 — Skriftlig behandling: Hvis klagen ikke løses umiddelbart, modtager du en skriftlig bekræftelse på modtagelse af din klage. Vi behandler din klage og svarer dig inden for 14 dage. Hvis behandlingen tager længere tid, informerer vi dig om årsagen og den forventede svartid.

c) Trin 3 — Eskalering: Hvis du ikke er tilfreds med vores svar, kan klagen eskaleres til ledelsen af AlphaAI Consult ApS. Kontakt os via e-mail på alphaaiconsult@gmail.com med anmærkningen "Eskalering af klage".

d) Trin 4 — Forbrugerklagenævnet: Hvis klagen ikke kan løses mellem parterne, kan forbrugere indgive en klage til Forbrugerklagenævnet via Konkurrence- og Forbrugerstyrelsens hjemmeside: www.kfst.dk. Forbrugerklagenævnet er et uafhængigt organ, der behandler tvister mellem forbrugere og virksomheder.

e) EU's online tvistløsning: Forbrugere med bopæl i EU kan også benytte EU-Kommissionens online tvistløsningsplatform (ODR) på: https://ec.europa.eu/consumers/odr.`,
    },
    {
      id: 'section-14',
      title: '14. Ændringer af vilkår',
      content: `AlphaFlow forbeholder sig retten til at ændre disse Forretningsbetingelser. Ændringer meddeles på følgende måde:

a) Mindre ændringer: Sådanne ændringer, der ikke væsentligt påvirker Kundens rettigheder eller forpligtelser (f.eks. fejlrettelser, klargørende tilføjelser), kan gennemføres uden forudgående varsel. Ændringer offentliggøres i Tjenesten.

b) Væsentlige ændringer: Sådanne ændringer, der væsentligt påvirker Kundens rettigheder eller forpligtelser (f.eks. prisændringer, nye vilkår, ændring af funktionalitet), meddeles skriftligt via e-mail minimum 30 dage før ikrafttrædelsen.

c) Forbrugerbeskyttelse: For forbrugere gælder, at væsentlige ændringer kræver accept. Hvis forbrugeren ikke accepterer de nye vilkår, har denne ret til at opsige abonnementet uden omkostninger inden ikrafttrædelsen, jf. Forbrugeraftalelovens § 18, stk. 3.

d) Fortsættelse af brug: Fortsat brug af Tjenesten efter ikrafttrædelsen af ændrede vilkår udgør accept af de ændrede vilkår.

e) Arkivering: Tidligere versioner af Forretningsbetingelserne arkiveres og kan tilgås via vores hjemmeside eller på anmodning.`,
    },
    {
      id: 'section-15',
      title: '15. Tvistløsning og værneting',
      content: `Disse Forretningsbetingelser er underlagt dansk ret. Eventuelle tvister mellem Kunden og AlphaFlow afgøres efter dansk ret, medmindre international privatret fører til anvendelse af anden lovgivning.

a) Værneting: Enhver tvist skal anlægges ved Retten i Aarhus som første instans, medmindre andet følger af ufravigelig lovgivning. AlphaAI Consult ApS har sit hjemting i Aarhus.

b) Forbrugertvister: For forbrugere gælder reglerne i Forbrugeraftalelovens § 31 om kompetent domstol. AlphaFlow anerkender Forbrugerklagenævnets kompetence til at behandle tvister om køb af digitale tjenester.

c) Lovvalg: Disse Vilkår reguleres af og fortolkes i overensstemmelse med dansk ret, uanset evt. kollisionsretlige principper.`,
    },
    {
      id: 'section-16',
      title: '16. Kontaktoplysninger',
      content: `Har du spørgsmål til disse Forretningsbetingelser, din konto eller Tjenesten, er du altid velkommen til at kontakte os:`,
    },
  ],

  contact: {
    heading: 'AlphaAI Consult ApS',
    company: 'AlphaAI Consult ApS',
    address: 'Skelagervej 124\n8200 Aarhus N\nDanmark',
    cvr: 'CVR-nr.: 46312058',
    email: 'alphaaiconsult@gmail.com',
    website: 'www.alphaflow.dk',
    phone: '61736076',
  },

  footerText: 'AlphaAI Consult ApS — CVR-nr. 46312058',
};

// ─── English content ───

const EN_CONTENT: LegalContent = {
  title: 'Terms of Service',
  lastUpdated: '1 July 2025',
  tocLabel: 'Table of Contents',
  backLabel: 'Back',

  sections: [
    {
      id: 'section-1',
      title: '1. General Terms',
      content: `These Terms of Service ("Terms") govern your access to and use of the AlphaFlow service provided by AlphaAI Consult ApS ("we", "us", "our").

By creating an account with AlphaFlow, you accept these Terms in their entirety. The Terms constitute a binding agreement between you and AlphaAI Consult ApS in accordance with Danish law, pursuant to the Consumer Agreements Act (Forbrugeraftaleloven, LBKG Executive Order No. 1079 of 27 August 2021) and the Marketing Practices Act (Markedsføringsloven, LBK No. 954 of 29 June 2023).

AlphaAI Consult ApS is wholly owned by AlphaCloud Holding ApS.

AlphaAI Consult ApS is registered with the Danish Business Authority (Erhvervs- og Selskabsstyrelsen). See section 16 for contact details.

These Terms apply to all users, whether using AlphaFlow as a consumer or a business customer. For business customers, additional provisions regarding data and liability apply as set out in section 10.

AlphaFlow reserves the right to update these Terms as described in section 14. We encourage you to periodically review the content of the Terms.`,
    },
    {
      id: 'section-2',
      title: '2. The Service',
      content: `AlphaFlow is a cloud-based accounting platform for Danish businesses that combines deterministic, rule-based software with artificial intelligence (AI) for document processing and workflow optimisation.

Important — AI and accounting: None of AlphaFlow's core accounting and bookkeeping functions are performed by AI. All financial calculations — including double-entry bookkeeping, contra-posting, VAT computation, VAT reconciliation, financial reports, and year-end closing — are performed exclusively by deterministic, rule-based software. This is a deliberate design choice: AI (including Large Language Models) has a non-deterministic nature, meaning results can vary for the same input. Such unpredictability is incompatible with the precision required in accounting and bookkeeping, where numbers have a single, correct answer.

The service includes the following core functionalities:
- Automatic OCR scanning of receipts and vouchers (AI-assisted)
- Rule-based bookkeeping with automatic contra-entry and financial account suggestions
- AI-assisted document categorisation as time-saving suggestions (always subject to the user's final approval)
- Creation, sending, and management of invoices (including EAN invoicing)
- Bank reconciliation via Open Banking PSD2 integration
- VAT reconciliation and generation of VAT returns for SKAT (Danish Tax Authority)
- Year-end closing and financial reporting
- Contact and debtor management
- Backup and export of accounting data (SAF-T, CSV, PDF)

AI is used exclusively as a time-saving supplement for administrative tasks such as document recognition and categorisation. AlphaFlow uses machine learning to improve categorisation accuracy over time. All AI-based suggestions are exactly that — suggestions — and must always be verified and approved by the user before they affect the accounts.

The service is delivered as Software-as-a-Service (SaaS) and is accessible via web browser and mobile application. AlphaFlow strives for a minimum uptime of 99.5% but cannot guarantee uninterrupted access. Scheduled maintenance windows are announced in advance via the service and/or email.

We reserve the right to temporarily restrict or suspend access to the Service in cases of suspected abuse, security breaches, or legal requirements, pursuant to the Danish Electronic Commerce Act (LBK No. 384 of 13 May 2022).`,
    },
    {
      id: 'section-3',
      title: '3. Delivery',
      content: `AlphaFlow is a digital service delivered as Software-as-a-Service (SaaS) via the internet.

a) Instant delivery: AlphaFlow is delivered immediately after completed payment and account creation. You gain instant access to the Service via our web platform at www.alphaflow.dk.

b) Activation process: To activate the Service, you must:
  1. Create an account with valid business information
  2. Confirm your email address via a verification link
  3. Select a subscription plan and complete payment
After completing these steps, the Service is immediately available.

c) Delivery method: The Service is delivered exclusively digitally via cloud infrastructure and is accessible through a web browser. No physical delivery takes place.

d) Digital delivery acknowledgment: By completing your purchase, you acknowledge that delivery of the digital service begins immediately after payment, and that you thereby lose your right of withdrawal, pursuant to the Consumer Agreements Act § 18b(2). This applies provided that AlphaAI Consult ApS has fulfilled its information obligations and you have expressly consented to the delivery beginning within the withdrawal period.

e) Access and availability: AlphaFlow endeavours to ensure uninterrupted access to the Service. Planned maintenance windows are announced in advance. AlphaFlow cannot guarantee that the Service will be available at all times.`,
    },
    {
      id: 'section-4',
      title: '4. Consumer\'s Right of Withdrawal',
      content: `As a consumer, you have the right to withdraw from your purchase of AlphaFlow within 14 days of entering into the agreement, pursuant to the Consumer Agreements Act § 18.

a) Withdrawal period: The withdrawal period runs from the day the agreement was concluded. If the period expires on a public holiday, Saturday, or Sunday, the period is extended to the following business day.

b) Exception for digital services: The right of withdrawal lapses if delivery of the digital service has begun with your prior consent and your acknowledgment that you thereby lose your right of withdrawal, pursuant to the Consumer Agreements Act § 18b. This applies to AlphaFlow, as the service is delivered immediately after payment and you expressly consent to delivery beginning within the withdrawal period.

c) How to withdraw: If you wish to exercise your right of withdrawal, you must send an unambiguous statement via email to:

AlphaAI Consult ApS
Email: alphaaiconsult@gmail.com

You may also use the standard withdrawal form below.

d) Standard withdrawal form:
"[This is only a standard form]

I/We (*) hereby notify that I/We (*) withdraw from my/our (*) agreement for the purchase of the following services (*):

Ordered on (*)/received on (*):
Consumer's name:
Consumer's address:
Date:

(*) Delete as applicable."

e) Refund: If you withdraw from your purchase, we shall reimburse all payments received from you without undue delay and no later than 14 days after the day on which we received your notification of withdrawal. The refund will be made using the same means of payment as you used for the original purchase.

f) Proof of withdrawal: It is your responsibility to demonstrate that you have exercised the right of withdrawal. Please retain your email receipt or other confirmation.`,
    },
    {
      id: 'section-5',
      title: '5. Return & Refund Policy',
      content: `As AlphaFlow is a digital SaaS service, no physical return is possible.

a) Digital service: AlphaFlow is delivered as a digital service and cannot be returned in the traditional sense. Upon cancellation of the subscription, your access to the Service ceases.

b) Refund for unused periods: For monthly subscriptions, no refund is provided for the current billing period, as the service is fully available throughout the entire period. For annual subscriptions, a proportional refund for remaining periods may, under special circumstances, be requested by written application to alphaaiconsult@gmail.com. Each case is assessed individually.

c) Refund processing: If a refund is approved, it will be processed within 14 days. The refund will be issued using the same payment method as was used for the original purchase.

d) Complaints about refunds: If you disagree with a refund decision, you may file a complaint as described in section 13 (Complaint Handling Procedure).`,
    },
    {
      id: 'section-6',
      title: '6. Subscription and Payment',
      content: `AlphaFlow is offered in several subscription plans with varying functionality and user limits. Current prices, plans, and terms are available on our website at the time of sign-up.

The minimum subscription period is 1 month. The subscription renews automatically with the selected billing period.

You can cancel or change your subscription at any time via the settings in the Service. Upon cancellation, you retain access to the Service until the end of the current billing period.

All prices are stated in Danish kroner (kr./DKK) and are exclusive of VAT. VAT is added at the applicable rate (currently 25%) and shown separately on the invoice, in accordance with the Danish VAT Act (Momsloven, LBK No. 1061 of 29 August 2023) and the Danish Invoice Act (Fakturaloven, LBK No. 1041 of 27 August 2021).

Payment is made via the payment method you have provided at sign-up (credit card, MobilePay, or bank transfer). Payment is charged automatically on the renewal date. In case of payment failure, AlphaFlow is entitled to suspend access to the Service after 14 days' written notice.

AlphaFlow reserves the right to change prices with 30 days' prior written notice (via email and/or notification in the Service). Consumers have the right to cancel the subscription without costs in the event of price increases, pursuant to the Consumer Agreements Act § 18.

Upgrading to a higher subscription plan incurs a prorated difference for the remaining period. Downgrades take effect at the next renewal date.

Invoicing occurs automatically in connection with subscription renewal.`,
    },
    {
      id: 'section-7',
      title: '7. User Obligations',
      content: `As a user of AlphaFlow, you undertake the following obligations:

a) Accurate information: You must provide true, complete, and up-to-date information when creating and maintaining your account, including the company name, address, CVR number, and contact details. Changes must be communicated to AlphaFlow immediately.

b) Security: You are responsible for the confidentiality of your login credentials and for all activity that occurs on your account. You must choose a strong password and keep it confidential. In case of suspected unauthorised access, you must immediately notify AlphaFlow and change your password.

c) Lawful use: You may only use AlphaFlow for lawful purposes in compliance with applicable Danish legislation, including the Danish Bookkeeping Act (Bogføringsloven, LBK No. 1320 of 14 November 2023) and the Danish Tax Control Act. Users must ensure their bookkeeping complies with Danish bookkeeping requirements.

d) AI assistants: AlphaFlow's AI features are used exclusively as time-saving suggestions for administrative tasks (e.g. document categorisation). AI does not participate in the execution of any accounting or bookkeeping calculations — all such functions are performed by deterministic software as described in section 2. The user bears ultimate responsibility for ensuring that bookkeeping is correct and complies with applicable law, including when approving AI-generated suggestions.

e) Backup: Although AlphaFlow offers backup functionality, it is recommended that users regularly take independent backups of important accounting data.

f) Age requirement: Use of AlphaFlow requires the user to be of legal age (at least 18 years) and authorised to enter into agreements on behalf of the registered company.

Breach of these obligations may result in suspension or closure of the account.`,
    },
    {
      id: 'section-8',
      title: '8. Data Protection and GDPR',
      content: `AlphaFlow processes personal data in accordance with the EU General Data Protection Regulation (GDPR — Regulation (EU) 2016/679) and the Danish Data Protection Act (Databeskyttelsesloven, LBK No. 934 of 28 June 2023).

We are the data controller for the personal data you provide in connection with the use of the Service. Our privacy policy, which constitutes a separate agreement, describes in detail how we process your data.

As a data subject, you have the following rights under GDPR Articles 12–22:
- Right of access to your personal data (Art. 15)
- Right to rectification of inaccurate data (Art. 16)
- Right to erasure ("right to be forgotten") (Art. 17)
- Right to restriction of processing (Art. 18)
- Right to data portability (Art. 20)
- Right to object to processing (Art. 21)

Requests to exercise your rights can be directed to our data protection officer via email: alphaaiconsult@gmail.com. We respond to requests within 30 days pursuant to GDPR Article 12.

For business customers, a Data Processing Agreement (DPA) is concluded in accordance with GDPR Article 28. The agreement is sent automatically upon creation and can be accessed via the settings in the Service.

Data is transferred to and stored on servers within the EU/EEA. In limited cases, data may be transferred to third countries with an adequate level of protection pursuant to GDPR Chapter V.

AlphaFlow has notified the processing of personal data to the Danish Data Protection Authority (Datatilsynet). Our CVR number can be found in section 16.`,
    },
    {
      id: 'section-9',
      title: '9. Intellectual Property',
      content: `All intellectual property rights to the AlphaFlow service — including software, design, graphics, logos, texts, databases, AI models (for document recognition and categorisation), and documentation — belong to AlphaAI Consult ApS or our licensors.

This applies in accordance with the Danish Copyright Act (Ophavsretsloven, LBK No. 935 of 28 June 2023) and relevant EU legislation on intellectual property.

You are granted a limited, non-exclusive, non-transferable, and revocable licence to use AlphaFlow in accordance with these Terms and your chosen subscription. The licence applies solely for internal use within your own business.

It is not permitted to:
- Reverse-engineer, decompile, or disassemble AlphaFlow's software
- Copy, modify, or distribute parts of the Service
- Use AlphaFlow's name, logo, or trademarks without prior written consent
- Use automated tools (bots, scrapers) to access the Service
- Sell, rent, or sub-license access to the Service

Users retain full rights to the data and documents they upload to AlphaFlow. AlphaFlow assumes no rights to user business data, beyond what is necessary to deliver the Service.

AI-generated categorisation suggestions for documents are based on AlphaFlow's proprietary models and constitute AlphaFlow's intellectual property. These suggestions relate exclusively to document management and do not affect accounting calculations, which are performed by separate deterministic software as described in section 2.`,
    },
    {
      id: 'section-10',
      title: '10. Limitation of Liability',
      content: `AlphaFlow's liability is subject to Danish law's general rules on contractual liability.

a) Compensation liability: AlphaFlow's total liability to the Customer — regardless of cause (including incorrect categorisation suggestions from AI, system downtime, data errors, or other direct damages) — is limited to the amount the Customer has paid to AlphaFlow for the subscription in the 12 months preceding the event giving rise to the claim. This does not apply in cases of gross negligence or intent. Note that AI is not used for accounting calculations as described in section 2.

b) Indirect damages: AlphaFlow is under no circumstances liable for indirect damages, including — but not limited to — lost profits, expected savings, operational losses, goodwill losses, or business interruption.

c) No advisory capacity: AlphaFlow is an accounting tool and does not constitute financial, tax, or legal advice. Accounting calculations in AlphaFlow are performed by deterministic, rule-based software, not by AI, as described in section 2. The user bears full responsibility for decisions made based on data from the Service.

d) Third-party services: AlphaFlow integrates with external services (banks, payment providers, Open Banking). We cannot be held liable for delays, errors, or disruptions caused by these third-party services.

e) Force majeure: AlphaFlow is exempt from liability in cases of force majeure, including natural disasters, war, terrorism, pandemic, government intervention, power outages, or cyberattacks that are beyond our reasonable control.

The limitations in this section apply to the extent permitted by Danish law, pursuant to the Consumer Agreements Act §§ 34–35. Consumers cannot waive rights arising from mandatory legislation.`,
    },
    {
      id: 'section-11',
      title: '11. Data Retention',
      content: `AlphaFlow retains user data in accordance with Danish legislation, including the Bookkeeping Act's requirement of 5 years' retention of accounting records.

a) Accounting data: All bookkeeping data is retained for a minimum of 5 years from the end of the financial year to which the data relates, pursuant to the Danish Bookkeeping Act § 10. The retention period may be extended if required by tax authorities.

b) Vouchers and documents: Uploaded receipts, invoices, and documents are retained for the same period as the associated accounting data. Image files are compressed and stored securely on encrypted servers.

c) User data: Account information, preferences, and activity logs are retained for as long as the account is active. After account deletion, personal data is anonymised within 30 days, unless legislation requires longer retention.

d) Security: All data is encrypted in transit (TLS 1.3) and at rest (AES-256). AlphaFlow conducts regular security audits and penetration tests.

e) Backup: Data is backed up daily and stored on geographically separated servers within the EU/EEA. Backups are retained for 30 days.

f) Export: Users can export their data at any time via the Service's export functions (SAF-T, CSV, PDF). AlphaFlow will provide data upon request within a reasonable timeframe upon termination.

g) Deletion: Upon termination, accounting data is retained for the period required by law. After the retention period expires, data is permanently deleted unless otherwise agreed or required by law.`,
    },
    {
      id: 'section-12',
      title: '12. Termination',
      content: `a) Termination by customer: You may cancel your subscription at any time via the settings in the Service or by contacting our customer service. The cancellation takes effect at the end of the current billing period. There is no commitment beyond the ongoing period.

b) Termination by AlphaFlow: AlphaFlow may terminate the subscription with 30 days' written notice. In cases of material breach of the Terms, termination may take effect immediately.

c) After termination: Upon termination, your account and data remain accessible for 30 days, after which they transition to archive mode. Accounting data is retained as specified in section 11.

d) Fees: No cancellation fees are charged. For annual subscriptions, the prepaid amount for the remaining period is not refunded upon early termination unless otherwise specified in the specific agreement.

e) Data transfer: AlphaFlow assists with exporting your data upon termination. We offer export in standardised formats (SAF-T, CSV, PDF) that can be imported into other accounting systems.`,
    },
    {
      id: 'section-13',
      title: '13. Complaint Handling Procedure',
      content: `We want to ensure that you are satisfied with AlphaFlow. If you have a complaint, please follow the procedure below:

a) Step 1 — Contact us: Reach out to our customer service via email (alphaaiconsult@gmail.com) or phone (contact details). Describe the complaint in as much detail as possible, including your name, CVR number, and a description of the issue. We aim to respond to enquiries within 2 business days.

b) Step 2 — Written processing: If the complaint is not resolved immediately, you will receive a written confirmation of receipt of your complaint. We will process your complaint and respond to you within 14 days. If processing takes longer, we will inform you of the reason and the expected response time.

c) Step 3 — Escalation: If you are not satisfied with our response, the complaint may be escalated to the management of AlphaAI Consult ApS. Contact us via email at alphaaiconsult@gmail.com with the subject line "Complaint escalation".

d) Step 4 — Consumer Complaints Board: If the complaint cannot be resolved between the parties, consumers may file a complaint with the Danish Consumer Complaints Board (Forbrugerklagenævnet) via the Danish Competition and Consumer Authority's website: www.kfst.dk. The Consumer Complaints Board is an independent body that handles disputes between consumers and businesses.

e) EU Online Dispute Resolution: Consumers residing in the EU may also use the European Commission's Online Dispute Resolution (ODR) platform at: https://ec.europa.eu/consumers/odr.`,
    },
    {
      id: 'section-14',
      title: '14. Changes to Terms',
      content: `AlphaFlow reserves the right to amend these Terms of Service. Changes are communicated as follows:

a) Minor changes: Changes that do not materially affect the Customer's rights or obligations (e.g., error corrections, clarifying additions) may be implemented without prior notice. Changes are published in the Service.

b) Material changes: Changes that materially affect the Customer's rights or obligations (e.g., price changes, new terms, changes to functionality) are communicated in writing via email at least 30 days before taking effect.

c) Consumer protection: For consumers, material changes require acceptance. If the consumer does not accept the new terms, they have the right to cancel the subscription without costs before the effective date, pursuant to the Consumer Agreements Act § 18(3).

d) Continued use: Continued use of the Service after the effective date of amended terms constitutes acceptance of the amended terms.

e) Archiving: Previous versions of the Terms of Service are archived and can be accessed via our website or upon request.`,
    },
    {
      id: 'section-15',
      title: '15. Dispute Resolution and Jurisdiction',
      content: `These Terms of Service are governed by Danish law. Any disputes between the Customer and AlphaFlow are resolved in accordance with Danish law, unless private international law leads to the application of other legislation.

a) Jurisdiction: Any dispute shall be brought before the Court of Aarhus (Retten i Aarhus) as the court of first instance, unless otherwise provided by mandatory legislation. AlphaAI Consult ApS's domicile is Aarhus.

b) Consumer disputes: For consumers, the rules of the Consumer Agreements Act § 31 regarding the competent court apply. AlphaFlow recognises the Danish Consumer Complaints Board's (Forbrugerklagenævnet) competence to handle disputes concerning the purchase of digital services.

c) Arbitration: The parties may mutually agree to resolve disputes through arbitration in accordance with the Danish Institute of Arbitration (Copenhagen Arbitration) rules.

d) Choice of law: These Terms are governed by and construed in accordance with Danish law, regardless of any conflict-of-law principles.`,
    },
    {
      id: 'section-16',
      title: '16. Contact Information',
      content: `If you have questions about these Terms of Service, your account, or the Service, please do not hesitate to contact us:`,
    },
  ],

  contact: {
    heading: 'AlphaAI Consult ApS',
    company: 'AlphaAI Consult ApS',
    address: 'Skelagervej 124\n8200 Aarhus N\nDenmark',
    cvr: 'CVR No.: 46312058',
    email: 'alphaaiconsult@gmail.com',
    website: 'www.alphaflow.dk',
    phone: '61736076',
  },

  footerText: 'AlphaAI Consult ApS — CVR No. 46312058',
};

// ─── Component ───

interface TermsOfServicePageProps {
  onBack?: () => void;
}

export function TermsOfServicePage({ onBack }: TermsOfServicePageProps) {
  const [language, setLanguage] = useState<Language>('da');
  const [isScrolled, setIsScrolled] = useState(false);

  const content = useMemo(() => (language === 'da' ? DA_CONTENT : EN_CONTENT), [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === 'da' ? 'en' : 'da'));
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 8);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, []);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({ view: 'dashboard' }, '', '/');
    }
  }, [onBack]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f8faf9] light-forced login-mesh">
      {/* Decorative background blobs */}
      <div className="login-shape-3 absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-[#0d9488]/[0.04] to-[#7c9a82]/[0.03] rounded-full blur-3xl pointer-events-none" />

      {/* ─── Sticky Header ─── */}
      <header
        className={`sticky top-0 z-30 transition-all duration-200 ${
          isScrolled
            ? 'bg-white/90 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.06)] border-b border-[#e2e8e6]/80'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: Back + Logo */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/70 hover:bg-white border border-[#e2e8e6]/80 hover:border-[#0d9488]/30 text-gray-600 hover:text-[#0d9488] transition-all duration-150 shadow-sm hover:shadow-md"
                aria-label={content.backLabel}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <Image
                src="/logo-clean.png"
                alt="AlphaFlow"
                width={110}
                height={74}
                className="object-contain h-7 sm:h-8 w-auto"
                priority
              />
            </div>

            {/* Right: Language toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white border border-[#e2e8e6]/80 hover:border-[#0d9488]/30 text-sm font-medium text-gray-600 hover:text-[#0d9488] transition-all duration-150 shadow-sm hover:shadow-md"
              aria-label={language === 'da' ? 'Switch to English' : 'Skift til dansk'}
            >
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">
                {language === 'da' ? 'EN' : 'DA'}
              </span>
              <span className="sm:hidden">
                {language === 'da' ? 'EN' : 'DA'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main
        className="flex-1 relative z-10"
        onScroll={handleScroll}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 pt-2 sm:pt-4">
          {/* ─── Hero / Title ─── */}
          <div className="mb-8 sm:mb-10">
            {/* Decorative icon */}
            <div className="mb-5">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#0d9488]/10 to-[#2dd4bf]/5 border border-[#0d9488]/10 flex items-center justify-center">
                <Scale className="h-7 w-7 text-[#0d9488]" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {content.title}
            </h1>

            {/* Last updated */}
            <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
              <CalendarDays className="h-4 w-4" />
              <span>
                {language === 'da' ? 'Senest opdateret' : 'Last updated'}: {content.lastUpdated}
              </span>
            </div>
          </div>

          {/* ─── Table of Contents ─── */}
          <nav
            className="mb-10 rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6"
            aria-label={content.tocLabel}
          >
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#0d9488]" />
              {content.tocLabel}
            </h2>
            <ul className="space-y-1">
              {TOC_ITEMS.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollToSection(item.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-gray-600 hover:text-[#0d9488] hover:bg-[#f0fdf9] transition-all duration-150 group"
                  >
                    <span className="text-[#0d9488]/60 group-hover:text-[#0d9488] transition-colors">
                      {item.icon}
                    </span>
                    <span className="flex-1 font-medium">{item.title[language]}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#0d9488]/60 transition-colors" />
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* ─── Sections ─── */}
          <article className="space-y-10">
            {content.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24"
              >
                {/* Section header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="hidden sm:flex items-center justify-center h-8 w-8 rounded-lg bg-[#f0fdf9] border border-[#ccfbef] flex-shrink-0 mt-0.5">
                    {TOC_ITEMS.find((i) => i.id === section.id)?.icon}
                  </div>
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 leading-snug">
                    {section.title}
                  </h2>
                </div>

                {/* Section content */}
                <div className="pl-0 sm:pl-11">
                  {section.id === 'section-16' ? (
                    /* Contact Information — special card layout */
                    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm overflow-hidden">
                      {/* Contact intro */}
                      <div className="p-5 sm:p-6">
                        <p className="text-[15px] text-gray-600 leading-relaxed whitespace-pre-line">
                          {section.content}
                        </p>
                      </div>
                      {/* Contact details */}
                      <div className="border-t border-[#e2e8e6]/80 bg-[#f0fdf9]/40 p-5 sm:p-6 space-y-4">
                        {/* Company name */}
                        <div className="flex items-start gap-3">
                          <Building2 className="h-5 w-5 text-[#0d9488] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{content.contact.company}</p>
                            <p className="text-sm text-gray-600 whitespace-pre-line mt-0.5">{content.contact.address}</p>
                          </div>
                        </div>
                        {/* CVR */}
                        <div className="flex items-center gap-3">
                          <Shield className="h-5 w-5 text-[#0d9488] flex-shrink-0" />
                          <p className="text-sm text-gray-600">{content.contact.cvr}</p>
                        </div>
                        {/* Phone */}
                        <div className="flex items-center gap-3">
                          <Phone className="h-5 w-5 text-[#0d9488] flex-shrink-0" />
                          <a
                            href={`tel:${content.contact.phone}`}
                            className="text-sm text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors"
                          >
                            {content.contact.phone}
                          </a>
                        </div>
                        {/* Email */}
                        <div className="flex items-center gap-3">
                          <Mail className="h-5 w-5 text-[#0d9488] flex-shrink-0" />
                          <a
                            href={`mailto:${content.contact.email}`}
                            className="text-sm text-[#0d9488] hover:text-[#0f766e] font-medium transition-colors"
                          >
                            {content.contact.email}
                          </a>
                        </div>
                        {/* Website */}
                        <div className="flex items-center gap-3">
                          <ExternalLink className="h-5 w-5 text-[#0d9488] flex-shrink-0" />
                          <span className="text-sm text-gray-600">{content.contact.website}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Regular prose content */
                    <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-[#e2e8e6]/80 shadow-sm p-5 sm:p-6">
                      <div className="text-[15px] text-gray-600 leading-[1.8] whitespace-pre-line">
                        {section.content}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ))}
          </article>

          {/* ─── Bottom CTA ─── */}
          <div className="mt-12 rounded-2xl bg-gradient-to-br from-[#0d9488]/[0.06] to-[#2dd4bf]/[0.03] border border-[#0d9488]/10 p-6 sm:p-8 text-center">
            <p className="text-sm text-gray-600 mb-1">
              {language === 'da'
                ? 'Har du spørgsmål til vores Forretningsbetingelser?'
                : 'Do you have questions about our Terms of Service?'}
            </p>
            <a
              href={`mailto:${content.contact.email}`}
              className="inline-flex items-center gap-2 text-[15px] font-semibold text-[#0d9488] hover:text-[#0f766e] transition-colors"
            >
              <Mail className="h-4 w-4" />
              {content.contact.email}
            </a>
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 py-6 sm:py-8 border-t border-[#e2e8e6]/60 bg-[#f8faf9]/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="sidebar-brand-badge mx-auto mb-2 w-fit">
            <span>Powered by</span>
            <span className="text-[#0d9488] font-semibold">AlphaAi Consult ApS</span>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            &copy; {new Date().getFullYear()} {content.footerText}
          </p>
          <p className="text-[11px] text-gray-300 text-center mt-1">
            {language === 'da'
              ? 'AlphaAI Consult ApS er fuldt ejet af AlphaCloud Holding ApS. Alle rettigheder forbeholdes.'
              : 'AlphaAI Consult ApS is wholly owned by AlphaCloud Holding ApS. All rights reserved.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
