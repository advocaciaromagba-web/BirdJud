import { createHash, timingSafeEqual } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

function authorized(request: NextRequest): boolean {
  const secret = process.env.INFRA_MONITOR_TOKEN;
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (!supplied.startsWith("Bearer ")) return false;
  const token = supplied.slice(7);
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const memory = process.memoryUsage();
  const eventLoopP99Ms = Number.isFinite(eventLoop.percentile(99))
    ? Math.round(eventLoop.percentile(99) / 1e6)
    : null;
  const response = {
    timestamp: new Date().toISOString(),
    service: "birdjud",
    instance: process.env.RAILWAY_REPLICA_ID ?? null,
    process: {
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      eventLoopDelayP99Ms: eventLoopP99Ms,
    },
    limits: {
      nodeHeapLimitBytes: null,
      containerCpuPercent: null,
      containerMemoryLimitBytes: null,
    },
    notes: "Métricas do processo Node.js, não da VPS ou banco. CPU, memória do contêiner, disco, rede e PostgreSQL devem vir do Railway e do banco.",
  };
  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}
