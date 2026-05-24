import Logo from "@/components/ui/logo";
import SignOutButton from "./sign-out-button";

export default function ProtectedHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/[0.06] bg-cream/70 px-6 py-4 backdrop-blur md:px-10">
      <Logo />
      <SignOutButton />
    </header>
  );
}
