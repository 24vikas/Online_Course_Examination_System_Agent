import { assertAuthorized } from "@/lib/auth";
import { NextRequest } from "next/server";
import { queryDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await assertAuthorized(req, ["COE_ADMIN"]);
  if ("errorResponse" in auth) return auth.errorResponse;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendUpdate = async () => {
        if (isClosed) return;
        try {
          const res = await queryDb(
            `SELECT 
               count(*) filter (where status = 'PENDING_COE_APPROVAL') as pending_count,
               count(*) as total_count,
               max(updated_at) as last_updated
             FROM exam_blueprints WHERE tenant_id=$1`, [auth.user.tenantId]
          );
          const data = {
            type: "QUEUE_STATUS",
            pendingCount: parseInt(res.rows[0]?.pending_count || "0", 10),
            totalCount: parseInt(res.rows[0]?.total_count || "0", 10),
            lastUpdated: res.rows[0]?.last_updated || new Date().toISOString(),
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore transient poll error
        }
      };

      // Initial push
      await sendUpdate();

      // Poll interval every 4 seconds
      const interval = setInterval(sendUpdate, 4000);

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
