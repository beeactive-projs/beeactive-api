# Redis on the free tier — what's actually possible for our case

> Re-research done 2026-05-03 because the original recommendation in [03-redis-hosting-options.md](./03-redis-hosting-options.md) leaned toward "pay $5/mo on Railway" without fully evaluating the free options for our specific scale.

## TL;DR

**Redis Cloud Essentials (the official Redis Inc. offering) free tier is the right pick for now.** 30 MB sounds tiny but it's enough for our notification + session-reminder traffic at the scale we're at. We migrate to a paid tier (still ~$5/mo) the day we feel pressure — the migration is a connection-string swap, no code changes.

The other "free" options are either incompatible with BullMQ or have hidden cost cliffs.

## The honest landscape (verified 2026-05-03)

| Option | Free tier specs | BullMQ-compatible? | Catch |
|---|---|---|---|
| **Redis Cloud Essentials** | 30 MB, 30 connections, 100 ops/sec, TCP | ✅ Yes (full Redis protocol) | 30 MB fills up if we keep job history. Tunable. |
| **Upstash Redis** | 256 MB, 500K commands/month, 1 DB | ⚠️ Compatible BUT "BullMQ accesses Redis regularly even when there's no queue activity" — kills you on PAYG | Per-command billing model is hostile to BullMQ. Switch to Fixed plan ($10/mo) to use it safely. |
| **Railway Redis** | None — $5/mo Hobby grant | ✅ Yes | Not actually free; the $5 hobby grant gets eaten by the API + Postgres + Redis combined. |
| **Render Redis (Key Value)** | Removed free tier in 2024 | ✅ Yes (when paid) | Starts at $10/mo |
| **Local Docker** | Unlimited, you already have it | ✅ Yes | Local dev only — we'd still need hosted for prod |

## Why Redis Cloud Essentials wins for our scale

### 1. It's a real free tier — not a credit grant

Redis Inc.'s 30 MB Essentials plan is **permanently free**. No 30-day trial, no expiring credits. As long as you stay under the limits it stays free forever. ([Redis Cloud pricing docs](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/))

Compare this to:
- **Railway**: $5/mo Hobby grant that resets monthly, but covers your *entire* deployment (API + Postgres + Redis). If your API alone burns >$5 you pay.
- **Upstash**: free up to 500K commands/month, then $0.20 per 100K. BullMQ pings Redis constantly even when idle, so the meter runs even when you have zero jobs.

### 2. Standard Redis = BullMQ works without surprises

Redis Cloud uses the standard Redis protocol over TCP. BullMQ is "fully Redis-compliant from version 6.2.0 onward" — no quirks, no warnings. ([BullMQ Redis compatibility docs](https://docs.bullmq.io/guide/redis-tm-compatibility))

Upstash, by contrast, has a documented incompatibility history with BullMQ ([GitHub issue #1087](https://github.com/taskforcesh/bullmq/issues/1087)). The library used to outright refuse Upstash hosts; now it just warns. The fundamental problem — Upstash's per-command billing vs BullMQ's chatty polling — hasn't changed.

### 3. 30 connections is enough

A standard BullMQ queue uses 3 Redis connections (Queue + Worker + QueueEvents). With our planned 7 queues, that's ~21 connections. Plus a few for cache reads. We have headroom.

### 4. 100 ops/sec is enough for our scale

Our notification system generates roughly:
- 1 op per `notify()` call (LPUSH a job)
- 2-3 ops per worker pick (BRPOP + execute)
- ~2 ops per job retention check

At 100 jobs/day (our MVP scale) that's <0.01 ops/sec average. We could 1000x our traffic and stay under the limit.

### 5. The 30 MB constraint is real but tunable

A BullMQ job at rest is roughly:
- ~500 bytes for metadata
- + the payload size (typically 200-500 bytes for our notification jobs)

So ~1 KB per active job. 30 MB ÷ 1 KB = **~30,000 jobs** before we fill memory.

The catch is **completed/failed job retention**. By default BullMQ keeps history forever. With our `removeOnComplete: { age: 86400 }` (1 day) and `removeOnFail: { age: 7 * 86400 }` (7 days) settings from [research file 02](./02-bullmq-architecture-patterns.md), retention is bounded.

**Practical limit on Redis Cloud free**: ~5,000 jobs/day average sustained throughput before pressure. We're nowhere near that.

## The cost cliff scenarios

### When does Redis Cloud free become tight?

- **Memory**: when we have ~20,000 jobs in flight + retention. That's "10x our MVP traffic" territory.
- **Connections**: if we run 10+ queues with multiple workers each. Phase 6 starts with 7 queues, one worker each → fine.
- **Throughput**: if we hit a burst of 100+ jobs/sec for sustained periods. Notification fan-outs (e.g. session cancelled → 30 participants) are bursty but small.

### What's the upgrade path?

Redis Cloud's next paid tier:
- **250 MB / Standard** — $5/mo (was $7 in 2025), gives unlimited connections, 1000 ops/sec
- Migration: change `REDIS_HOST` env var. No code change.

We'd absolutely know we're hitting the wall — Bull Board UI would show queue depth growing, our latency metrics would degrade. There's no surprise cliff.

### The Upstash math is worse than it looks

Upstash's free tier looks generous (256 MB > 30 MB). But:

> "BullMQ accesses Redis regularly, even when there is no queue activity. This can incur extra costs" — [Upstash docs](https://upstash.com/docs/redis/integrations/bullmq)

BullMQ workers do `BRPOPLPUSH` blocking calls every few seconds whether jobs exist or not. Plus `XREAD` for events. Plus delayed-job scheduler scans.

Rough math: 7 queues × 1 worker × 1 op/2sec = 3.5 ops/sec idle = ~9M ops/month. Free tier is 500K/month. We'd blow through the free tier in 1.4 days **with zero actual jobs**.

To use Upstash safely we'd need their **Fixed plan ($10/mo)** which removes per-command billing. That's worse than Redis Cloud's $5 paid tier.

## My specific recommendation for MotionHive

### Local development
**Keep using your Docker Redis container.** Already running, free, fast, no quotas. Same protocol as production.

### Staging
**Redis Cloud free (30 MB Essentials).** Real Redis, real TCP, real free. Verifies the connection-string-only migration path before prod.

### Production (Phase 6 launch)
**Redis Cloud free (30 MB Essentials).** Same as staging.

### Production (when we feel pressure)
**Upgrade to Redis Cloud Standard 250 MB ($5/mo).** Same vendor, same connection string format, same Redis protocol — change one env var.

We'd see the upgrade trigger in Bull Board: queue depth growing, completed-job retention getting truncated more aggressively, or latency on `enqueue()` calls climbing.

## The setup steps (when we get to Phase 6)

```bash
# 1. Sign up at redis.io/cloud — free, no credit card
# 2. Create a database in the Essentials free tier:
#    - Name: motionhive-prod
#    - Region: closest to your Railway region (us-east-1 typical)
#    - Plan: 30 MB free
# 3. Copy the connection details from the dashboard:
#    - Host: redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
#    - Port: 12345
#    - Password: long-random-string

# 4. Set env vars on Railway (production) and locally if needed
REDIS_HOST=redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=long-random-string

# 5. Update src/app.module.ts BullModule config to include the password:
#    redis: { host, port, password }
```

Local dev keeps using `REDIS_HOST=localhost`, `REDIS_PORT=6379`, no password (Docker container). Same Bull config code reads both — just different env values.

## What I won't do (and why)

**❌ Recommend Upstash even though it's "more memory":** the per-command billing model is fundamentally hostile to BullMQ. Even on the Fixed plan it's more expensive than Redis Cloud paid for what we get.

**❌ Recommend Railway Redis from day 1:** it's not actually free (eats into the $5 grant), it's vendored to Railway, and there's no migration win since Redis Cloud is just as easy to set up.

**❌ Recommend running our own Redis on a VPS:** at our scale the operational burden (backups, monitoring, OS patches) costs more than $5/mo of attention.

## Updated cost projection

Was (file 09 of original research):
- MVP: $5–10/mo (assumed Railway Redis from day 1)

Now:
- **MVP: $0/mo for Redis** (Redis Cloud free, until we hit ~5k jobs/day or 20k retained jobs)
- Growth: $5/mo (upgrade to 250 MB Standard)
- Scale: $20–50/mo (1 GB+ tier when we genuinely need it)

So the answer to your question is **yes, you can absolutely use a free Redis tier** — just pick the right one (Redis Cloud, not Upstash), and don't pay for Railway Redis on day 1.

## Sources

- [Redis Cloud Essentials plan details](https://redis.io/docs/latest/operate/rc/subscriptions/view-essentials-subscription/essentials-plan-details/) — official free tier specs
- [BullMQ ↔ Redis compatibility](https://docs.bullmq.io/guide/redis-tm-compatibility) — confirms Redis Cloud works
- [BullMQ connections guide](https://docs.bullmq.io/guide/connections) — connection requirements (3 per queue)
- [Upstash + BullMQ integration docs](https://upstash.com/docs/redis/integrations/bullmq) — official Upstash position with the cost warning
- [BullMQ issue #1087](https://github.com/taskforcesh/bullmq/issues/1087) — historical Upstash incompatibility, partially resolved
- [Upstash 2026 pricing](https://upstash.com/docs/redis/overall/pricing) — verified free tier limits + Fixed plan pricing
- [Railway pricing 2026](https://docs.railway.com/pricing/plans) — confirms there's no permanent free Redis tier
