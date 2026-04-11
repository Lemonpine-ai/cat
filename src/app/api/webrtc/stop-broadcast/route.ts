import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * sendBeacon 용 방송 종료 API.
 * beforeunload/pagehide 에서 호출되어 stale live 세션을 정리한다.
 *
 * 인증: device_token(UUID)이 사실상 bearer token 역할.
 * sendBeacon 은 Authorization 헤더를 지원하지 않으므로
 * token 자체의 엔트로피(122-bit)로 보안을 확보한다.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { device_token?: string };
    const token = body.device_token;
    if (!token) {
      return new Response("missing device_token", { status: 400 });
    }

    /* service role 로 RPC 호출 — anon 클라이언트로는 SECURITY DEFINER 충분 */
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    await supabase.rpc("stop_device_broadcast", {
      input_device_token: token,
    });

    return new Response("ok", { status: 200 });
  } catch {
    return new Response("error", { status: 500 });
  }
}
