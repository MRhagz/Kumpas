import Logo from "@/components/ui/logo";
import SignOutButton from "./sign-out-button";

export default function ProtectedHeader() {
  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.06] bg-cream/70 px-4 py-4 backdrop-blur sm:px-6 md:px-10">
      <Logo />
      <div className="ml-auto flex min-w-0 max-w-full items-center gap-3 sm:gap-5">
        <nav id="workflow-guidance" aria-label="Workflow help" className="flex min-w-0 items-center gap-2 empty:hidden [&>button]:min-w-0 [&>button>svg]:shrink-0" />
        <div className="shrink-0"><SignOutButton /></div>
      </div>
    </header>
  );
}
