import InputContainer from "@/components/input/input-container";
import ProtectedHeader from "@/components/auth/protected-header";
import Link from "next/link";
import { Suspense } from "react";

export default function InputPage() {
  return (
    <div className="min-h-screen bg-background font-sans">
      <ProtectedHeader />
      <div className="py-10">
        <Suspense
          fallback={
            <section className="mx-auto w-full max-w-4xl px-4 text-sm text-muted-text sm:px-6">
              Loading session...
            </section>
          }
        >
          <InputContainer />
        </Suspense>
      </div>

      {/* Bottom spacer */}
      {/* Footer */}
      <footer className="pb-10 flex flex-col items-center gap-2">
        <div className="h-px w-48 bg-black/[0.06]" />
        <p className="text-xs text-muted-text">
          By using Kumpas, you agree to our{" "}
          <Link
            href="/privacy"
            className="font-medium text-ink underline-offset-4 hover:underline transition-colors"
          >
            Privacy Policy
          </Link>
          {" "}·{" "}RA 10173 Compliant
        </p>
      </footer>
    </div>
  );
}
