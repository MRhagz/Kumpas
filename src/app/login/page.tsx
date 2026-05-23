import Link from "next/link";
import Logo from "@/components/ui/logo";
import styles from "@/styles/landing.module.css";
import LoginForm from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans">
      <div className={styles.blobGreen} />
      <div className={styles.blobGold} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="px-6 py-5 md:px-10">
          <Logo />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-12">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.08] bg-white/70 px-8 py-9 shadow-card backdrop-blur-sm">
            <h1 className="font-heading text-3xl font-bold tracking-tight text-ink">
              Sign in
            </h1>
            <p className="mt-1.5 text-sm text-muted-text">
              Counselor access only
            </p>

            <div className="mt-7">
              <LoginForm />
            </div>
          </div>
        </main>

        <footer className="pb-8 flex flex-col items-center gap-2">
          <div className="h-px w-48 bg-black/[0.06]" />
          <p className="text-xs text-muted-text">
            By signing in you agree to our{" "}
            <Link
              href="/privacy"
              className="font-medium text-ink underline-offset-4 hover:underline transition-colors"
            >
              Privacy Policy
            </Link>
            {" · "}RA 10173 Compliant
          </p>
        </footer>
      </div>
    </div>
  );
}
