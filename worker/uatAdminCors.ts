import type { GroupedReviewWorkerEnvironment } from "./configuration";

export function uatAdminCorsHeaders(request: Request, environment: GroupedReviewWorkerEnvironment): HeadersInit {
  const origin = request.headers.get("origin")?.trim();
  const allowed = (environment.UAT_ADMIN_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    "vary": "Origin",
  };
}
