import React from 'react';

/** Shared shell: matches Test Repository (zinc, shadcn-like panels). */
export const workspacePageClass = 'flex h-full min-h-0 flex-col bg-zinc-100 font-sans text-zinc-950';

export const explorerHeaderRowClass =
  'grid grid-cols-[minmax(0,1fr)_140px_100px_80px] gap-2 border-b border-zinc-200 bg-zinc-50/90 px-3 py-2 text-[11px] font-medium text-zinc-500';

type WorkspacePanelProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ title, children, className = '' }) => (
  <div className={`rounded-md border border-zinc-200 bg-white text-zinc-950 shadow-sm ${className}`}>
    <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
    {children}
  </div>
);

type WorkspacePageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  /** Toolbar row below title (e.g. filters) */
  toolbar?: React.ReactNode;
  actions?: React.ReactNode;
};

export const WorkspacePageHeader: React.FC<WorkspacePageHeaderProps> = ({ title, subtitle, toolbar, actions }) => (
  <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h1>
        {subtitle != null && subtitle !== '' && <p className="text-[13px] text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {toolbar && <div className="mt-3 border-t border-zinc-100 pt-3">{toolbar}</div>}
  </header>
);
