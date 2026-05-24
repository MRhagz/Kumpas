import { LogOut } from "lucide-react";

export default function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-text transition-colors hover:text-ink cursor-pointer"
      >
        <LogOut size={14} />
        <span>Sign out</span>
      </button>
    </form>
  );
}
