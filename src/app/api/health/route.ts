import { NextResponse } from "next/server";

import { checkRedisConnection } from "@/lib/cache/client";
import { checkDbConnection } from "@/lib/db/client";

export async function GET() {
  try {
    const [database, redis] = await Promise.all([checkDbConnection(), checkRedisConnection()]);

    return NextResponse.json(
      {
        status: "ok",
        service: "sunkelo",
        checks: {
          database,
          redis,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        service: "sunkelo",
        error: error instanceof Error ? error.message : "Unknown healthcheck error",
      },
      { status: 503 },
    );
  }
}
