# Analýza son-g.com (fáza 1)

Cieľ: zistiť herné mechaniky hry son-g.com ako podklad pre jednoduchšiu hru **songuess**.
Z son-g.com preberáme len mechaniky. Kód, grafika, texty ani branding sa nepreberajú.

- **Dátum pozorovania:** 17.–18. 10. 2026
- **Rozsah:** len verejne dostupné stránky a API ako neprihlásený hosť. Žiadny účet, platba ani prihlásenie.
- **Stav:** čaká na schválenie zoznamu funkcií v časti [7](#7-návrh-funkcií-pre-songuess).

## 0. Metóda a dôkazy

**Nástroje:**

| Nástroj | Použitie |
|---|---|
| REA `rea-agents@6.5.0` cez CLI | `list-browser-targets`, `inspect-web-page`, `capture-web-screenshot`, `capture-browser-scenario` |
| Chromium 141 headless | pripojený cez CDP, REA ho ovládal cez Playwright scenáre |
| statická analýza | verejné skripty `/js/*.js`, `/i18n/en.js`, HTML stránky |
| curl | verejné API son-g.com ako hosť a verejné Deezer API |
| ffprobe | meranie dĺžky a formátu audio súborov |

REA beží cez CLI, nie ako MCP server. Cloudový kontajner je efemérny a registrácia MCP by po reštarte zanikla. CLI príkazy vracajú rovnaké Evidence objekty ako MCP nástroje.

**Postup:** šesť oblastí zbieral každú samostatný agent. Výsledky potom skúšali vyvrátiť nezávislí overovatelia, jeden zo statického kódu a jeden zo živej stránky.

| Oblasť | Zistenia | Statické overenie | Živé overenie |
|---|---|---|---|
| herné režimy | 30 | áno, 4 opravené | nedobehlo |
| bodovanie | 14 | áno | áno, 1 opravené |
| hudba | 16 | áno | nedobehlo, kľúčové body overené ručne v 3.4 |
| UI | 24 | nedobehlo | nedobehlo, kľúčové snímky skontrolované ručne |
| prihlásenie | 23 | nedobehlo | nedobehlo, kľúčové body overené ručne v 5 |
| živé kolo | 17 | nedobehlo | nedobehlo, poradie požiadaviek overené z REA výstupov |

Opravené tvrdenia sú v texte uvedené už v opravenej podobe. Tvrdenia, ktoré overil len jeden agent, sú označené *(1 zdroj)*.

**Snímky obrazovky nie sú v repozitári.** Obsahujú branding son-g.com a obaly albumov z Deezeru a repozitár je verejný. V dokumente sú uvedené REA evidence ID a SHA-256 snímok. Súbory sú uložené v pracovnom adresári session.

## 1. Herné režimy a priebeh kola

### 1.1 Prehľad režimov

| Režim | Princíp | Cena | Hosť |
|---|---|---|---|
| **Speed Challenge** | hádanie z rastúcej ukážky, 5 úrovní | zadarmo | jedno pevné ukážkové kolo |
| **Split Challenge** | hádanie zo stôp nástrojov (bicie, basa, melódia, spev) | 1 kredit za pieseň | jedno pevné ukážkové kolo |
| **Daily Challenge** | Daily Speed a Daily Split, 5 rovnakých piesní pre všetkých, jeden pokus denne | zadarmo, za sériu dní kredity | ukážková sada 5 piesní |
| **Remix** | tvorba remixu zo stôp až 4 piesní | kredity | len zostavenie ukážky |
| **Community** | prehrávanie zdieľaných remixov | zadarmo | áno |
| **Výzva priateľovi** | odkaz na 5 alebo 10 vybraných piesní | Speed zadarmo, Split kredity | hranie áno, tvorba nie |

Dôkazy: `page_home.html` obsahuje odkaz na Daily a tri karty režimov. `router.js` definuje zoznam SPA ciest `/`, `/home`, `/remix`, `/split`, `/speed`, `/daily`, `/community`. Stránky `/daily/speed`, `/daily/split`, `/rankings` a `/challenge/<slug>` sa načítavajú samostatne (HTTP 200, vlastné skripty).

### 1.2 Priebeh jedného kola Speed Challenge

1. Hráč vyberie žáner alebo dekádu z 12 kariet, alebo vyhľadá interpreta. Kolo sa spustí hneď na najnižšej obťažnosti. *(`speed.js`: `DEFAULT_DIFFICULTY_ID="beginner"`, REA `ev_3a6c886c…` pre hľadanie interpreta)*
2. Hosť dostane namiesto kola okno s ponukou prihlásenia alebo ukážkovej piesne. Ukážka je vždy tá istá pieseň bez ohľadu na zvolený žáner. *(REA `ev_6f25893a…`, `ev_d4db9ecc…`; `POST /api/speed/round` vrátil rovnaké `round_id` pre rôzne žánre aj obťažnosti)*
3. Server vytvorí kolo a pripraví prvú ukážku dlhú 0,1 s. Prehrávač ju načíta, ale nespustí sám. *(REA `ev_9ff6bb69…`)*
4. Hráč púšťa ukážku tlačidlom. Tlačidlo nápovedy zvýši úroveň, načíta dlhšiu ukážku a hneď ju prehrá. *(REA `ev_9e254260…`)*
5. Hráč píše názov piesne. Našepkávač po 300 ms ponúkne skladby vo formáte názov, interpret a album. Výber z ponuky tip hneď odošle. *(REA `ev_063b454c…`, `ev_5ab1d526…`)*
6. Zlý tip zobrazí krátku hlášku na 2 s, zatrasie poľom a zníži možné skóre. Hráč pokračuje ďalej. *(REA `ev_5ab1d526…`)*
7. Na poslednej úrovni sa nápoveda zmení na tlačidlo „vzdať sa“. Vzdať sa dá kedykoľvek aj tlačidlom v hlavičke.
8. Kolo končí správnym tipom alebo vzdaním. Zobrazí sa názov, interpret, obal, získané body a automaticky sa prehrá celá 30 s ukážka. *(REA `ev_f81f8f74…`)*
9. Ďalšie kolo pokračuje na vyššej obťažnosti v tom istom žánri, aj po vzdaní. Po poslednej obťažnosti sa beh končí. Hosť namiesto pokračovania vidí výzvu na registráciu.

**Poradie API volaní v živom kole hosťa** (REA `capture-browser-scenario`, udalosti `network`):

| Krok | Požiadavka | Evidence |
|---|---|---|
| načítanie stránky | `GET /api/speed/genres`, `GET /api/curated/genres` | `ev_d4db9ecc…` |
| spustenie ukážky | `POST /api/speed/round`, `GET …/clip/1` | `ev_9ff6bb69…` |
| nápoveda 1 | `GET …/clip/2` | `ev_9e254260…` |
| zlý tip | `GET /api/tracks?q=…`, `POST …/guess` | `ev_5ab1d526…` |
| nápoveda 2 | `GET …/clip/3` | `ev_7b26628d…` |
| vzdanie | `POST …/giveup`, `GET …/reveal`, `GET …/preview` | `ev_f81f8f74…` |

Počas celého kola nevznikla žiadna chyba v konzole ani chyba stránky. *(REA `ev_7b26628d…` 1 zdroj)*

### 1.3 Ostatné režimy stručne

- **Split Challenge:** 4 úrovne v pevnom poradí bicie, basa, melódia a spev. Každá nápoveda odomkne ďalšiu stopu. Príprava piesne trvá niekoľko minút, lebo server rozdeľuje zvuk na stopy. V režime žánru alebo interpreta je to séria 5 kôl so súčtom bodov. *(`split.js`: `STEMS`, `SPLIT_TOTAL_ROUNDS=5`)*
- **Daily Challenge:** dva nezávislé behy po 5 piesňach. Nová sada je každý deň o 00:00 UTC, pre všetkých rovnaká, s jedným pokusom. Výsledok sa dá zdieľať ako text s farebnými štvorčekmi. Séria dní dáva kredity v rebríčku 5, 10, 20, 40, 80 a 160 dní. *(`page_daily.html`, `GET /api/daily`)*
- **Remix, Community, Výzva priateľovi:** nie sú to hádacie singleplayer režimy. Pre songuess nie sú relevantné.

## 2. Bodovanie, časomiera, kolá, životy, nápovedy

### 2.1 Bodovanie

| Parameter | Speed | Split |
|---|---|---|
| úrovne nápovedy | 5 | 4 |
| základ bodov podľa úrovne | 1000, 700, 400, 180, 60 | 1000, 600, 300, 100 |
| zlý tip | násobok 0,8 | násobok 0,8 |
| opakované prehratie ukážky | násobok 0,99 | bez penalizácie |
| vzdanie | 0 bodov | 0 bodov |
| minimum za správny tip | 1 bod | 1 bod |

Vzorec pre Speed: `round(základ[úroveň] × 0,99^opakovania × 0,8^zlé_tipy)`, minimálne 1.

Dôkazy: `speed.js` a `game-ui.js` (`createLiveScoreTracker`, `baseScoreByLevel`). Živé API vrátilo pri tipoch na ukážkové kolo tieto hodnoty:

| Úroveň | Opakovania | Zlé tipy | Body |
|---|---|---|---|
| 1 | 0 | 0 | 1000 |
| 1 | 3 | 0 | 970 |
| 1 | 0 | 2 | 640 |
| 1 | 3 | 2 | 621 |
| 2 až 5 | 0 | 0 | 700, 400, 180, 60 |
| 1 | 0 | 50 | 1 |

Body počíta server rovnakým vzorcom, aký klient zobrazuje počas kola. Úroveň, opakovania a zlé tipy však posiela klient. Pre songuess z toho plynie, že tieto počítadlá musí viesť server sám.

### 2.2 Časomiera, životy, počet kôl

- **Časomiera neexistuje.** Klient posiela čas od prvého prehratia, ale skóre sa nemení. Pri 0 s, 2,5 s aj 15 minútach bolo skóre rovnaké. *(overené staticky aj živo)*
- **Životy neexistujú.** Jediné obmedzenie je rebríček nápovedy a tlačidlo vzdať sa.
- **Počet kôl:** Speed beh má 5 kôl, jedno na každú obťažnosť, bez súčtu bodov. Split séria má 5 kôl so súčtom do 5000. Daily má 5 piesní so súčtom do 5000 za režim.
- **Obťažnosti:** päť stupňov od najznámejších hitov po skladby pre fanúšikov. Počas kola sú len na čítanie.

### 2.3 Porovnanie a rebríčky

- Po správnom tipe server vráti priemer bodov ostatných hráčov pre danú pieseň a úroveň a percentil. Rátajú sa len správne tipy. *(živé overenie opravilo pôvodné tvrdenie)*
- Globálny rebríček Daily používa vážený priemer: `rating = (počet_hier × priemer + 8 × globálny_priemer) / (počet_hier + 8)`. Vzorec presne sedí na všetkých 20 verejných riadkoch. *(`GET /api/daily/rankings`)*
- Mená v rebríčku sú prezývka alebo maskovaný začiatok e-mailu.

## 3. Zdroj hudby a dĺžka ukážok

### 3.1 Zdroj

Hudba pochádza výhradne z **Deezeru**. Spotify, Apple Music ani YouTube sa pri hádaní nepoužívajú.

- Vyhľadávanie skladieb a interpretov vracia Deezer ID a obaly z `cdn-images.dzcdn.net`.
- Podmienky aj zásady ochrany súkromia son-g.com uvádzajú Deezer ako zdroj ukážok, metadát a obalov.
- YouTube a nahrávanie súborov existuje len v režime Remix.

### 3.2 Ukážky v Speed Challenge

Server stiahne 30 s ukážku z Deezeru a sám z nej vyreže krátke úseky. Prehliadač počas kola nekomunikuje s Deezer audio serverom. *(REA `ev_ecf71733…`, 1 zdroj)*

| Úroveň | Nominálne | Namerané (ffprobe) | Veľkosť |
|---|---|---|---|
| 1 | 0,1 s | 0,13 s | 2 133 B |
| 2 | 0,5 s | 0,55 s | 8 821 B |
| 3 | 1 s | 1,04 s | 16 762 B |
| 4 | 2 s | 2,04 s | 32 644 B |
| 5 | 4 s | 4,05 s | 64 827 B |
| po kole | celá ukážka | 29,99 s | 479 827 B |

Formát je MP3 128 kbps, 44,1 kHz. Úseky začínajú asi 5,2 s od začiatku ukážky a každý kratší je začiatkom dlhšieho. *(1 zdroj, merané krížovou koreláciou na jednej piesni)*

### 3.3 Split a Remix

Stopy pre Split sa delia z tej istej 30 s ukážky, nie z celej skladby. Namerané stopy mali 29,99 s. *(1 zdroj)* Celé skladby vstupujú do systému len cez nahratie alebo YouTube odkaz v režime Remix.

### 3.4 Overenie Deezer API pre songuess

Overené priamo z tohto prostredia 18. 10. 2026:

| Overenie | Výsledok |
|---|---|
| `GET https://api.deezer.com/search?q=…` bez kľúča | 200, JSON s poľom `preview` |
| `/chart/0/tracks`, `/genre`, `/search/playlist` | 200, ukážky prítomné |
| CORS na `api.deezer.com` | chýba `Access-Control-Allow-Origin`, prehliadač API priamo nezavolá |
| dĺžka ukážky | 29,99 s, MP3 128 kbps |
| platnosť odkazu na ukážku | podpísaný odkaz, platí 900 s |
| zmenený podpis | 403 |
| Range požiadavka na prvých 64 000 B | 206, výsledok má 4,0 s |
| CORS na audio CDN | `Access-Control-Allow-Origin: *` |

Z toho plynie, že vyhľadávanie musí ísť cez náš server. Krátke úseky sa dajú poslať aj bez ffmpeg, stačí preposlať prvých N bajtov ukážky (128 kbps je 16 000 B za sekundu).

### 3.5 Podmienky Deezeru

Prečítané z `developers.deezer.com/guidelines` a `developers.deezer.com/termsofuse`:

- Koncovému používateľovi smú byť prístupné len 30 s ukážky.
- Lokálne alebo offline ukladanie audio dát je zakázané.
- Použitie je obmedzené na nekomerčný účel a súkromné použitie v rodinnom rozsahu.
- Osobné stránky a osobné aplikácie sú povolené. Iné použitie vyžaduje predchádzajúci súhlas Deezeru.
- Číselný limit požiadaviek podmienky neuvádzajú.

## 4. Štruktúra UI a obrazovky

**Rozloženie:** na počítači je vľavo zvislá lišta s ikonami režimov. Pod 680 px sa zmení na spodnú lištu s piatimi položkami. *(REA `ev_08610317…`, `ev_814aedb6…`)* Každá stránka má viac obrazoviek, ktoré sa prepínajú skrytím a zobrazením.

| Obrazovka | Obsah | Evidence |
|---|---|---|
| úvod | odkaz na Daily, tri karty režimov, tlačidlá prihlásenia | `ev_814aedb6…` |
| výber kategórie | hľadanie interpreta, 12 kariet žánrov v skupinách dekády, žánre a CZ/SK | `ev_08610317…` |
| okno pre hosťa | ponuka prihlásenia alebo ukážkovej piesne | `ev_6f25893a…` |
| načítanie | animácia počas vytvárania kola | 1 zdroj |
| kolo | prehrávač, obťažnosti, odznak úrovne a bodov, dĺžky ukážok, nápoveda, pole na tip | `ev_9ff6bb69…` |
| našepkávač | zoznam skladieb nad poľom | `ev_063b454c…` |
| výsledok kola | názov, interpret, body, ďalšia obťažnosť, prehrávanie ukážky | `ev_f81f8f74…` |
| Daily | séria, odpočet, dve karty režimov, rebríček odmien | `ev_f9f63323…` |
| rebríček | pre hosťa len výzva na prihlásenie | `ev_53fdf9c8…` |
| prihlásenie | okno aj samostatná stránka s Google, Apple a e-mailom | `ev_e8c0a1a0…` |

**Spätná väzba:** zlý tip zatrasie poľom. Správny tip spustí konfety. Pokles možných bodov má krátku animáciu.

**Snímky** (mimo repozitára, SHA-256 prvých 16 znakov):

| Súbor | Obsah | SHA-256 |
|---|---|---|
| `ui/shots/01_home_desktop.png` | úvod, počítač | `e553e9e1f6a5260a` |
| `ui/shots/02_speed_genre_desktop.png` | výber kategórie | `fa2c8082a3267dfb` |
| `ui/shots/03_speed_guest_modal_desktop.png` | okno pre hosťa | `2b682f95bde9ab71` |
| `ui/shots/05_speed_round_desktop.png` | začiatok kola | `09ad476796401d9c` |
| `ui/shots/06_speed_autocomplete_desktop.png` | našepkávač | `6f79ea715f10f980` |
| `liveround/pass2/r2.png` | po prvej nápovede | `dea6b944f579e601` |
| `liveround/pass2/r3.png` | po zlom tipe | `802d4fd2c774d8af` |
| `liveround/pass2/r5.png` | po vzdaní | `5c9e35db6fc0713a` |
| `ui/shots/10_daily_hub_desktop.png` | Daily | `5db5bd70245ee103` |
| `ui/shots/15_login_modal_desktop.png` | prihlásenie | `66a1b5705f65b01d` |
| `ui/shots/19_rankings_desktop.png` | rebríček | `910c8bba5dc12b87` |
| `ui/shots/32_speed_round_mobile390.png` | kolo na mobile 390 px | `1d5003f41553efbf` |

## 5. Prihlásenie a ukladanie dát

**Spôsoby prihlásenia:** e-mail a heslo s obnovou a overením e-mailu, Google a Apple. *(statická analýza, 1 zdroj)*

**Google** používa Google Identity Services. Klient vykreslí tlačidlo, po prihlásení dostane ID token a pošle ho na server ako `{credential}`. Nejde o One Tap ani o presmerovanie. *(overené ručne v `social-signin.js`)*

**Relácia** je jedna cookie `songy_session`, platí 30 dní alebo do odhlásenia. *(overené ručne: odhlásenie vracia `Set-Cookie` s `Max-Age=0; Path=/; SameSite=lax`, zásady ochrany súkromia uvádzajú 30 dní)*

**Stav pri načítaní stránky** je vložený priamo do HTML ako JSON s údajmi hosť alebo prihlásený, používateľ, kredity a stav Daily. *(overené ručne: element `app-bootstrap` v HTML úvodnej stránky)*

**Čo sa ukladá:**

| Kde | Čo |
|---|---|
| server | e-mail, prezývka, hash hesla, ID účtu Google alebo Apple, kredity, nákupy, skóre a séria Daily, uložené remixy, výzvy |
| server, krátkodobo | nahraté audio a IP adresa kvôli ochrane prihlásenia |
| prehliadač | cookie relácie, cookie jazyka, Google Analytics, priebeh Daily kola |
| prehliadač, hosť | cookie jazyka, Google Analytics a cookie knižnice Google; localStorage a sessionStorage sú prázdne |

Hosť nemá účet ani reláciu. Kolo hosťa žije len v pamäti stránky a po obnovení stránky začína znova. *(REA `ev_136fb535…`, `ev_f81f8f74…`, `ev_d4db9ecc…`)*

## 6. Zoznam REA dôkazov

| Evidence ID | Operácia | Čo ukazuje |
|---|---|---|
| `ev_d4db9ecc0cd3f6ab407fa5e79560a33f94e1fd1aa0c9b2b91f182ccc7b10fd7c` | capture_browser_scenario | klik na žáner otvorí okno pre hosťa |
| `ev_9ff6bb69a3f38390f55c23e4c5e13e3f337c595368ff9cb0a2a2dbec89966914` | capture_browser_scenario | spustenie ukážkového kola, načítaná ukážka 1 |
| `ev_9e2542608c70ad7283e68fdbffcadb1781089c87238d051b02de4f267a61d6f0` | capture_browser_scenario | nápoveda načíta ukážku 2, body klesnú na 700 |
| `ev_5ab1d5269864b6714bba0a2944ca56daa7c739cfb8072b0ee6b60abd89108eda` | capture_browser_scenario | zlý tip, našepkávač, body klesnú na 560 |
| `ev_7b26628d53e3fd3a0f18be91109be9fd2eb492cbe5bef3b51752660df14fcd38` | capture_browser_scenario | nápoveda 2, žiadne chyby v konzole |
| `ev_f81f8f7489e9162eafc8b1a44786af6784722d2018436ae8ee07a7ab8a92247d` | capture_browser_scenario | vzdanie, odhalenie, prehratie celej ukážky |
| `ev_08610317783bcbf5713ca370b81cb82b4e30cb80e642a96367ee1d95598f0171` | inspect_web_page | štruktúra DOM obrazovky kola |
| `ev_814aedb6261771ed352b56b1187592d9618d7e574926b9b8182de865322d6502` | capture_browser_scenario | úvod na mobile 390 px |
| `ev_6f25893aa2d39047e992659a10a69e92b5e701225e86ee10bcc3d06aa0a54e21` | capture_browser_scenario | okno pre hosťa |
| `ev_063b454c3e3ca2809989b812e428218bb594543484bd85eaf52dc9d0ca44e57a` | capture_browser_scenario | našepkávač po napísaní „don“ |
| `ev_7871acbde75f7ef4e5bedce03268cd773e9fa32db7470316685d07e038b5a4c3` | capture_browser_scenario | výsledok po vzdaní, výzva na registráciu |
| `ev_f9f63323d08e3fdbc1342d88fa539114f5b68e573b8b8fdd3ab9c209f667cdb6` | capture_browser_scenario | obrazovka Daily |
| `ev_53fdf9c8433a861526e2508462327603ab80dd11b8f3d54895d79954160c254e` | capture_browser_scenario | rebríček pre hosťa |
| `ev_e8c0a1a0ccc7fa1723aee64c968a78c5a46d6c79d9dafc5a3049688a4a9b6891` | capture_browser_scenario | okno prihlásenia |
| `ev_136fb5356deb610bdae581ba19c68bd5273880ee511ef8df15577292e1d06d16` | capture_browser_scenario | úložisko prehliadača hosťa je prázdne |
| `ev_3a6c886c0c2b82c58e48ef5d3a5ae8801dcd33b03032ebae91c37e4fdd0671db` | capture_browser_scenario | hľadanie interpreta |

## 7. Návrh funkcií pre songuess

### 7.1 Navrhujem prevziať

1. **Jeden režim: hádanie z rastúcej ukážky.** Princíp ako Speed Challenge, 5 úrovní dĺžky ukážky.
2. **Hra s pevným počtom piesní.** Jedna hra má 5 piesní z jednej kategórie, výsledok je súčet bodov.
3. **Výber kategórie** z pevného zoznamu, napríklad aktuálne hity, dekády 80. až 2010, rock, hip hop a SK/CZ. Kategórie budú Deezer playlisty alebo rebríčky.
4. **Nápoveda** prehrá ďalšiu, dlhšiu ukážku. Na poslednej úrovni ostane len tip alebo vzdanie.
5. **Tip s našepkávačom** z Deezer vyhľadávania cez náš server. Server porovná názov a interpreta po normalizácii, napríklad bez „Remastered“, „Live“ a zátvoriek.
6. **Bodovanie:** základ podľa úrovne, zlý tip násobí body 0,8, vzdanie dá 0. Bez časomiery a bez životov, rovnako ako son-g.com.
7. **Výsledok kola** ukáže názov, interpreta, obal a prehrá celú 30 s ukážku.
8. **Výsledková obrazovka hry** ukáže súčet a zoznam piesní s bodmi.
9. **Hosť hrá celú hru bez obmedzení.** Skóre vidí, ale neukladá sa.
10. **Voliteľné prihlásenie cez Google** tlačidlom Google Identity Services. Server overí ID token a nastaví vlastnú cookie relácie.
11. **Uloženie skóre** prihláseného hráča: história hier a najlepšie skóre.
12. **Rebríček** najlepších hier, jeden riadok na hráča.
13. **Responzívne rozloženie** pre mobil aj počítač.

Oproti son-g.com navrhujem dve zmeny v prospech férového rebríčka:

- Stav kola drží server: odpoveď, aktuálnu úroveň a počet zlých tipov. Odpoveď sa pošle až po skončení kola.
- Prehliadač nikdy nedostane odkaz na Deezer ukážku počas kola. Krátke úseky posiela náš server, ktorý z Deezeru prepošle len prvých N bajtov. Nič sa neukladá na disk.

### 7.2 Navrhujem vynechať

| Funkcia son-g.com | Dôvod |
|---|---|
| Split Challenge | potrebuje delenie zvuku na stopy pomocou ML, čo je náročné na výkon |
| Remix, Community, Výzva priateľovi | nie sú to hádacie singleplayer režimy |
| Daily Challenge, séria dní, odmeny | denná logika navyše, dá sa doplniť neskôr |
| obťažnosti a hľadanie interpreta | jedna úroveň a pevné kategórie stačia na prvú verziu |
| kredity, platby, promo kódy | hra je zadarmo |
| e-mail a heslo, obnova hesla, overenie e-mailu, Apple | dohodnuté len Google prihlásenie |
| porovnanie s priemerom a percentil | potrebuje štatistiky, nie je nutné |
| vážený rating rebríčka | stačí najlepšie skóre |
| zdieľanie výsledku | nie je požadované |
| penalizácia za opakované prehratie | server ju nevie spoľahlivo overiť |
| viac jazykov, analytika, predbežné načítanie stránok | UI bude len po slovensky, bez sledovania |
| animácie ako konfety a vinyl | stačí jednoduchá farebná spätná väzba |

### 7.3 Rozhodnutia na schválenie

1. **Dĺžky ukážok:** navrhujem 1, 2, 4, 8 a 15 s. Son-g.com používa 0,1 až 4 s, čo je veľmi ťažké.
2. **Počet piesní v hre:** navrhujem 5.
3. **Body podľa úrovne:** navrhujem 1000, 700, 400, 200 a 100, so zlým tipom 0,8.
4. **Kategórie:** navrhujem 8 kategórií z bodu 3 vyššie. Konkrétne Deezer playlisty vyberiem vo fáze 2.
5. **Ukladanie o hráčovi:** navrhujem len Google ID a meno, bez e-mailu.
6. **Podmienky Deezeru:** povoľujú osobné a rodinné nekomerčné použitie. Ak bude hra verejná pre cudzích ľudí, podľa podmienok treba súhlas Deezeru.

### 7.4 Navrhovaný stack

Jeden Node.js server (Node 24 LTS) so vstavaným `node:sqlite`, statické HTML, CSS a JavaScript bez frameworku. Jediná závislosť navyše je knižnica na overenie Google ID tokenu. Docker Compose s jednou službou a jedným zväzkom pre databázu.

## 8. Obmedzenia analýzy

- Prihlásené toky neboli pozorované: história skóre, kredity, beh cez všetky obťažnosti a reálna Daily sada.
- Výber piesne podľa obťažnosti beží na serveri a nie je viditeľný.
- Posun 5,2 s v ukážke bol zmeraný len na jednej piesni.
- Prehrávanie zvuku v reálnych prehliadačoch s predvolenou politikou automatického prehrávania nebolo testované.
- Kontrola bodovania posielala tipy na verejné ukážkové kolo. Tie sa započítali do verejných priemerov son-g.com pre túto pieseň.
