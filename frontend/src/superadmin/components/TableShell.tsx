import React from 'react';

interface Column {
  label: string;
  align?: 'left' | 'right';
}

/** The portal's table frame: caption, header row and horizontal scroll where a table is wide. */
export const TableShell: React.FC<{
  caption: string;
  columns: Column[];
  minWidth?: number;
  busy?: boolean;
  children: React.ReactNode;
}> = ({ caption, columns, minWidth = 640, busy, children }) => (
  <div className="border border-hq-border rounded-xl overflow-hidden bg-hq-card" aria-busy={busy}>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-hq-muted border-b border-hq-border text-hq-muted-foreground font-bold uppercase tracking-wider text-[10px]">
            {columns.map((column) => (
              <th key={column.label} scope="col" className={`py-3 px-4 ${column.align === 'right' ? 'text-right' : ''}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hq-border">{children}</tbody>
      </table>
    </div>
  </div>
);

export const LoadingRows: React.FC<{ columns: number; rows?: number }> = ({ columns, rows = 3 }) => (
  <>
    {Array.from({ length: rows }).map((_, index) => (
      <tr key={index} aria-hidden="true">
        <td colSpan={columns} className="py-4 px-4">
          <div className="h-4 rounded bg-hq-muted animate-pulse motion-reduce:animate-none" />
        </td>
      </tr>
    ))}
  </>
);

export const EmptyRow: React.FC<{ columns: number; title: string; detail: string }> = ({ columns, title, detail }) => (
  <tr>
    <td colSpan={columns} className="py-10 px-4">
      <div className="text-center max-w-md mx-auto">
        <p className="font-bold text-hq-foreground text-sm">{title}</p>
        <p className="text-hq-muted-foreground mt-1.5 leading-relaxed">{detail}</p>
      </div>
    </td>
  </tr>
);
