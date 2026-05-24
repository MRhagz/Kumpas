import { BarChart3, Shield, Brain } from "lucide-react";

export const AGENTS = [
    { id: "feasi", icon: Shield, label: "Academic Auditor", color: "#C4861C", bg: "#F5E6CC", desc: "Academic aptitude analysis" },
    { id: "labor", icon: BarChart3, label: "Industry Analyst", color: "#6B8C6B", bg: "#D4E6D4", desc: "Real-time labor intelligence" },
    { id: "jobDemand", icon: Brain, label: "Feasibility Strategist", color: "#5B7FA6", bg: "#D4E2F0", desc: "Scholarship & cost feasibility" },
];

export const ANALYSIS_STEPS = [
    "Parsing career notes…",
    "Calibrating semantic model…",
    "Running Academic Auditor scan…",
    "Activating Industry Analyst…",
    "Profiling Feasibility Strategist…",
    "Generating Adjacent Career Paths…",
];
