import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/LoginScreen";

function LoginFallback() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#5c7d79",
        fontSize: "0.85rem",
      }}
    >
      불러오는 중…
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginScreen />
    </Suspense>
  );
}
