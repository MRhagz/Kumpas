"use client";

interface ProcessingNoticeProps {
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

export default function ProcessingNotice({ confirmed, onConfirm }: ProcessingNoticeProps) {
  const contact = process.env.NEXT_PUBLIC_SCHOOL_PRIVACY_CONTACT;
  return (
    <aside aria-label="Processing and privacy notice" className="mb-6 rounded-xl border border-sage/20 bg-sage/5 p-4 text-sm leading-relaxed text-charcoal-2">
      <h2 className="font-semibold">Before processing student information</h2>
      <p className="mt-2">
        For licensed guidance counselors assisting Grade 10 and Senior High School students.
        Submit only a prepared career-interview summary, typed or photographed, and optional
        Form 137, NCAE and NAT records. Career Goal (including Undecided) and Personal Interests
        and Strengths are required; the other three note fields are optional.
      </p>
      <p className="mt-2">
        Vercel hosts application processing. Supabase provides authentication and restricted
        temporary session storage. Gemini processes submitted images for extraction and
        approved inputs for automated career analysis. Typed-only notes skip image extraction;
        they are not automatically redacted. Remove names, birthdates, student IDs and
        confidential details yourself. Do not submit complete confidential counseling records.
      </p>
      <p className="mt-2">
        The approved handling policy limits session access to the owning counselor and
        authorized service operations. Recovery drafts expire 24 hours after creation;
        server PDFs expire 24 hours after generation or earlier Cancel or End Session.
        Temporary images must be deleted when no longer needed. Restricted academic
        correction logs are retained for 12 calendar months and exclude counselor notes.
        Save approved reports through the school’s approved process. Application deletion
        does not determine Gemini’s separate provider retention terms.
      </p>
      <p className="mt-2">
        Recommendations are advisory, may be limited by missing academic evidence, and
        require counselor review before release. Before using real records, confirm the
        approved deployment’s storage, deletion and provider terms with {contact || "your school’s designated privacy contact"}.
      </p>
      <label className="mt-3 flex items-start gap-2 font-medium">
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} />
        I have read this notice and confirm that any prepared note photograph I submit
        excludes personal identifiers and confidential details.
      </label>
    </aside>
  );
}
