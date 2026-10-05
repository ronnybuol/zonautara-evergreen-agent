# Zonautara Evergreen Agent

Mesin editorial otomatis untuk artikel evergreen berbasis sumber, quality gate, visual, dan publikasi WordPress.

## Status MVP v0.1
Fondasi Cloudflare Worker + D1 + cron 15 menit + dashboard mobile + kill switch + jam aktif WITA + batas harian. Generator sengaja masih safety-mode dan WordPress belum diaktifkan sampai provider riset/model dikonfigurasi.

## Deploy
1. `npm install`
2. `npx wrangler login`
3. `npx wrangler d1 create evergreen-agent`
4. Salin database_id ke `wrangler.toml`
5. `npx wrangler d1 execute evergreen-agent --remote --file=./schema.sql`
6. `npm run deploy`
7. Buka URL Worker.

## Prinsip
Source-first; tidak mengarang referensi; agen boleh SKIP; editorial memory; default Draft Only; API key hanya Wrangler secrets.

## Roadmap berikut
Research provider, multi-LLM model router, claim/source ledger, SEO opportunity scoring, quality gate, SVG infographic, image provider, WordPress connector, audit log.
