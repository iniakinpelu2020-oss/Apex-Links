# Apex Links

A URL shortener and a link-in-bio page, with click counts you own.

**Status: not built. It is blocked on one thing that is not free.**

## The blocker, stated plainly

A shortener needs short links, which means a domain. `something.workers.dev` works but is
long and ugly, and free subdomain services come and go — when one dies, every link you ever
shared dies with it. This is the only product in the suite where a small annual cost is
genuinely hard to avoid.

If you already own a domain, this becomes easy and free to run.

## What it should do

- Create a short code for a URL.
- Redirect on request, counting the click.
- A public bio page listing your links.

## The constraint that shapes it

Counting clicks is a write on every visit. Firestore would burn its 20,000 daily writes;
Cloudflare Workers KV or D1 is a better fit, but D1 free is 5 GB total across the whole
account, which is fine for counters.

Redirects must be fast and must never be blocked by a login.

## What you need to do

1. A domain, and its nameservers pointed at Cloudflare.
2. Nothing else.

## First three steps

1. A Worker route that maps a code to a URL and returns a 302.
2. Click counting in D1, with a daily rollup rather than a row per click.
3. A small page for creating links, behind your normal sign-in.
