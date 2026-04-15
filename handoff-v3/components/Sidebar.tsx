"use client";

type Phase = "empty" | "uploading" | "ready" | "culling" | "culled" | "reviewing" | "reviewed";

interface Props {
  phase: Phase;
  onAddFolder?: () => void;
}

const WORKFLOW_ITEMS = [
  { icon: "auto_awesome_motion", label: "CULL", phases: ["culling", "culled"] as Phase[] },
  { icon: "psychology", label: "REVIEW", phases: ["reviewing", "reviewed"] as Phase[] },
];

export default function Sidebar({ phase, onAddFolder }: Props) {
  return (
    <aside className="fixed left-0 top-0 h-full flex flex-col pt-20 bg-surface-lowest w-20 z-40">
      <div className="flex flex-col items-center gap-2 mb-8">
        <span className="font-label text-primary font-black text-[10px]">WORKFLOW</span>
      </div>

      <div className="flex flex-col gap-1" role="navigation" aria-label="Workflow steps">
        {WORKFLOW_ITEMS.map((item) => {
          const isActive = item.phases.includes(phase);
          return (
            <button
              key={item.label}
              aria-label={`${item.label} step${isActive ? " (active)" : ""}`}
              aria-current={isActive ? "step" : undefined}
              className={`flex flex-col items-center justify-center p-4 transition-colors duration-200 ${
                isActive
                  ? "bg-primary text-on-primary scale-90"
                  : "text-on-surface/40 hover:bg-surface-bright hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-label text-[11px] uppercase tracking-tighter mt-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {onAddFolder && (
        <button
          onClick={onAddFolder}
          className="mt-auto mb-8 mx-auto bg-primary text-on-primary px-3 py-1 font-label text-[10px] font-bold"
        >
          + FOLDER
        </button>
      )}
    </aside>
  );
}
