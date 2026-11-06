import styles from "@/styles/analysis.module.css";

interface RelatedCareer {
  career: string;
  status: "In-Demand" | "Emerging" | "Stable";
  score: number;
}

const STATUS_STYLES = {
  "In-Demand": "bg-forest/10 text-forest",
  Emerging: "bg-amber-50 text-amber-700",
  Stable: "bg-blue-50 text-blue-700",
};

export default function RelatedCareersPanel({ careers }: { careers: RelatedCareer[] }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-text">Adjacent Paths</p>
      <h3 className="text-base font-bold text-ink">Related Careers</h3>
      <p className="text-[10px] text-muted-text">Scored across all three frameworks</p>
      <ul className={`mt-3 max-h-[200px] space-y-2 overflow-y-auto ${styles.scrollbarThin}`}>
        {careers.map((career) => (
          <li key={career.career} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.04] px-4 py-3 text-sm">
            <span className="font-medium text-ink">{career.career}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[career.status]}`}>{career.status}</span>
            <span className="font-bold text-ink">{career.score}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
