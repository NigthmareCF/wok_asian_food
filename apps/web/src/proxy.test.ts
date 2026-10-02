import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { ACCESS_COOKIE } from "@/modules/auth/auth-constants";
import { proxy } from "./proxy";

describe("private route proxy", () => {
  it("redirects an anonymous request before rendering private content", () => {
    const response = proxy(new NextRequest("http://localhost/client/orders"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fclient%2Forders",
    );
  });

  it("allows a request with an access session to reach the secure layout", () => {
    const request = new NextRequest("http://localhost/admin", {
      headers: { cookie: `${ACCESS_COOKIE}=signed-token` },
    });

    expect(proxy(request).headers.get("x-middleware-next")).toBe("1");
  });
});
