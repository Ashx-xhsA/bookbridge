---
name: Harness / Worker Provider Decisions
description: Which translation provider to pick for which situation, plus the local-worker run command and the gotchas that took an hour to debug (macOS Python SSL, mymemory URL limit, workerFetch timeout split, OpenAI-compatible universal provider)
type: project
originSessionId: f3f82155-21c6-4ec9-9d99-afdee5358c2b
---
Decisions made during issue #51 testing (2026-04-18) and the 2026-04-20 OpenAI-compatible provider decision.

## Provider choice

- **Demo / end-to-end wiring test** → `TRANSLATION_PROVIDER=mock`. Returns `[<target_lang>] <source_text>` instantly, no network, no size limit. Right for video demos and proving the pipeline works.
- **Real translation of full chapters** → `TRANSLATION_PROVIDER=openai_compat` + `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL`. One provider handles **any OpenAI-compatible API** (OpenAI, DeepSeek, Moonshot/Kimi, Zhipu GLM, Qwen, Groq, local Ollama). User has an OpenAI key on hand, so that's what local testing uses.
- **Claude / Anthropic provider stays a stub.** Claude's wire format (`/v1/messages`, `x-api-key` header, different response shape) is NOT OpenAI-compatible — it needs its own provider if/when we want it. Out of scope until there's a concrete need.
- **MyMemory is unusable for this project.** It puts the whole text in the URL query string as a GET request and 414s with `Request-URI Too Large` on anything past ~500 characters. Fine for a sentence, not for a 20-page chapter.

**Why — one OpenAI-compatible provider instead of one-per-vendor:** The OpenAI `/chat/completions` wire format is the de-facto industry standard. Nearly every commercial LLM API (DeepSeek, Moonshot, Zhipu, Qwen, Groq, Together, Mistral, local Ollama) exposes an OpenAI-compatible endpoint. A single 40-line provider that reads `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` from env covers all of them — swap vendors by changing three env vars, no code change. Only Anthropic/Claude sits outside this standard.

**Why — MyMemory stays in the registry but unused:** It's the default for test env (`tests/test_worker_api.py` uses the mock, not mymemory). Real demos on the Schrödinger PDF hit 414 immediately because chapters are 10–40 KB of source text.

**How to apply:**
- If the user is demoing, restart the worker with `mock`.
- For real Chinese output, use `openai_compat` with their preferred vendor's env values. Don't suggest `claude` as a real-translation path — the provider is a `NotImplementedError` stub.
- Don't suggest `mymemory` for anything larger than a unit-test sentence.
- Future BYOK work (end users bringing their own key) will likely extend `openai_compat` to read the key from a per-request BFF header instead of env — flag this when the user revisits the free-tier / paid-tier feature.

## Local worker run command

From `<project-root>`:
```
TRANSLATION_PROVIDER=mock .venv/bin/uvicorn bookbridge.worker_api.main:app --port 8000 --reload
```

The Next.js `bookbridge-next/.env.local` already has `WORKER_URL=http://localhost:8000` (with a commented Railway URL as the alternate). Restart `next dev` is NOT required after changing `WORKER_URL` — Next.js picks it up on the next request — but IS required if you add a new env var.

## macOS Python 3.13 SSL cert fixup (one-time)

Python 3.13 from the python.org macOS installer does not ship a CA bundle, so any `urllib.request.urlopen(https://...)` raises `SSL: CERTIFICATE_VERIFY_FAILED`. Symptom: the worker's `mymemory` or `claude` provider fails before sending a request.

Fix:
```
"/Applications/Python 3.13/Install Certificates.command"
```
Run once per machine; restart the worker after. Verified working in this project's `.venv` on 2026-04-18 (the venv inherits the certifi bundle via OpenSSL config).

**How to apply:** If the worker logs show `SSLCertVerificationError` and the user is on macOS, send them the command above before suggesting any provider switch.

## workerFetch timeout split

`lib/worker.ts` accepts `timeoutMs` per call. Default is **6000ms** (keeps `/translate/chunk` under Vercel's 10s hobby-tier function ceiling so the route can return its own 502 before a gateway 504). `/api/upload` overrides to **55_000ms** because `/parse` walks every PDF page + runs OCR cleanup and legitimately takes 10–30s on a 300-page book. `/api/upload` also sets `export const maxDuration = 60` for Vercel Pro deploys.

**Why:** Earlier review iteration dropped the global timeout 8s → 6s. That broke `/parse` — the worker returned `200 OK` at ~7s but the BFF had already aborted. Discovered during local testing with the Schrödinger PDF.

**How to apply:** Any new endpoint the BFF calls on the worker needs its own timeout judgment. Short synchronous LLM calls → stick with the 6s default. Anything that iterates over a document → explicit override.
