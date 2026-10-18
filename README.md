# songuess

Jednoduchá hra na hádanie pesničiek. Počúvaš čoraz dlhšiu ukážku a hádaš názov piesne.

- Hra má 5 piesní z vybranej kategórie alebo od vybraných interpretov.
- Ukážka má 5 úrovní: 1, 2, 4, 8 a 15 sekúnd.
- Body za uhádnutie: 1000, 700, 400, 200 alebo 100 podľa úrovne. Každý zlý tip ich vynásobí 0,8.
- Hrať sa dá hneď ako hosť. Po prihlásení cez Google sa skóre ukladá a zobrazí v rebríčku.
- Hudba sú 30-sekundové ukážky z verejného Deezer API. Nič sa neukladá na disk.

Analýza predlohy a dohodnuté funkcie sú v [docs/son-g-analyza.md](docs/son-g-analyza.md).

## Spustenie

```sh
cp .env.example .env    # voliteľne doplň GOOGLE_CLIENT_ID
docker compose up --build
```

Hra beží na http://localhost:3000. Databáza SQLite je v Docker zväzku `data`.

Bez `GOOGLE_CLIENT_ID` sa prihlásenie nezobrazí a hra beží len pre hostí.

## Vývoj bez Dockeru

Potrebuješ Node.js 24.

```sh
npm install
GOOGLE_CLIENT_ID=... npm start
npm test
```

## Google Client ID

1. Otvor https://console.cloud.google.com/auth/clients a vytvor alebo vyber projekt.
2. V časti **Google Auth Platform** vyplň **Branding**: názov aplikácie a e-mail podpory.
3. V časti **Audience** nechaj typ **External**. Buď pridaj e-maily hráčov medzi **Test users**, alebo klikni na **Publish app**. Na prihlásenie stačia základné oprávnenia, overenie aplikácie Googlom netreba.
4. V časti **Clients** klikni na **Create client** a vyber typ **Web application**.
5. Do **Authorized JavaScript origins** pridaj:
   - `http://localhost`
   - `http://localhost:3000`
   - `https://songuess.fabrici.xyz`
6. **Authorized redirect URIs** nechaj prázdne. Prihlásenie používa tlačidlo Google s odpoveďou cez JavaScript, nie presmerovanie.
7. Skopíruj **Client ID** v tvare `…apps.googleusercontent.com` do súboru `.env` ako `GOOGLE_CLIENT_ID`. Client secret netreba.

## Deezer

Podmienky Deezer API povoľujú nekomerčné, súkromné použitie v rodinnom rozsahu. Na verejnú prevádzku pre cudzích ľudí treba súhlas Deezeru.
