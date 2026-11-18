# Apex Links

Offline-first bookmarks with short links you host yourself. Vanilla HTML/CSS/JS, no build step,
no tracking, no third-party requests, relative `./` paths so it also runs from `/apps/links/`
inside the ApexOS bundle.

## Status

This ships the half of the idea that needs no server: bookmarks, tags, search, and short links
resolved by the app itself. The earlier plan here was a Worker + D1 redirect service with
click counts and a public bio page; that needs a domain pointed at Cloudflare and a deploy, so
it is **not** included, and aliases only resolve in the browser that saved them.

## Run

```sh
python3 -m http.server 8080
# then open http://127.0.0.1:8080/
```

Service workers need `http://localhost` or HTTPS.

## What it does

| control | what it does |
|---|---|
| Add link | Saves an address with an optional title, tags, note and pin |
| Search | Matches title, address, alias, note and tags |
| Tags / Pinned | Filters the grid; click a tag chip on a card to jump to it |
| `#/s/<alias>` pill | Copies the self-hosted short link for that bookmark |
| Export JSON | Downloads every bookmark as `apex-links-YYYY-MM-DD.json` |
| Import | Reads that JSON back, or a browser bookmarks HTML export |
| `/` and `n` | Focus search / open the add form |

Addresses must be `http:` or `https:`; anything else is refused rather than saved.

## Short links

There is no server: the app is the resolver. `#/s/<alias>` (or `?s=<alias>`) looks the alias
up in local storage, counts the open and sends you to the address. In ApexOS the app runs in an
iframe, so the target opens in a new tab; most sites refuse to be framed.

Aliases are unique, lowercase and generated from the title when you leave the field empty
(`apex-notes`, `apex-notes-2`, ...). Host the folder at the root of a domain if you want the
short links to be short; under `/apps/links/` they carry that prefix but still work.

Because the alias table lives in `localStorage`, a short link only resolves in the browser that
saved it. Export the JSON if you want to move the table to another device.

## What the hosted version would add

A Worker route that maps `/s/<alias>` to a `302`, click counts rolled up per day in D1, and a
public bio page listing links in a chosen order. That is the part that needs the domain, and it
is not in this repo. The alias is stored in the export, so a redirect route can later be pointed
at the same table without changing how bookmarks are edited.

## Storage

Bookmarks live in `localStorage` under `apex.links.v1`:

```json
[{ "id": "...", "url": "https://...", "title": "...", "note": "",
   "tags": ["work"], "alias": "example", "pinned": false, "hits": 0,
   "created": 1730000000000, "updated": 1730000000000 }]
```

Nothing is uploaded, and clearing site data deletes the bookmarks.

## Bundling into ApexOS

`Apexos` clones this repo into `apps/links/` (roster entry `Apex-Links links` in
`.github/workflows/bundle-apex.yml`). Keep every path relative (`./styles.css`, not
`/styles.css`) or the app breaks under `/apps/links/`.

When the shell files change, bump `CACHE` in `sw.js` (`apex-links-v1` → `v2`) so installed
clients pick up the new assets instead of serving the old cache.
