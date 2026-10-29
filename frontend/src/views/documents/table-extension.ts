import { Node, mergeAttributes } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import {
  columnResizing,
  tableEditing,
  isInTable,
  selectedRect,
  CellSelection,
  addRowBefore as pmAddRowBefore,
  addRowAfter as pmAddRowAfter,
  deleteRow as pmDeleteRow,
  addColumnBefore as pmAddColumnBefore,
  addColumnAfter as pmAddColumnAfter,
  deleteColumn as pmDeleteColumn,
  deleteTable as pmDeleteTable,
  mergeCells as pmMergeCells,
  splitCell as pmSplitCell,
  setCellAttr,
  goToNextCell,
} from 'prosemirror-tables';
import { Selection, type EditorState } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

export {
  pmAddRowBefore,
  pmAddRowAfter,
  pmDeleteRow,
  pmAddColumnBefore,
  pmAddColumnAfter,
  pmDeleteColumn,
  pmDeleteTable,
  pmMergeCells,
  pmSplitCell,
};

export interface BorderConfig {
  side: 'all' | 'outside' | 'inside' | 'top' | 'right' | 'bottom' | 'left' | 'none';
  thickness?: number; // in pt
  style?: 'solid' | 'dashed' | 'dotted' | 'none';
  color?: string; // hex
}

/**
 * Custom Table Node extension configured for rich document layout and styling.
 */
export const CustomTable = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  isolating: true,

  extendNodeSchema(extension) {
    if (extension.name === 'table') {
      return { tableRole: 'table' };
    }
    return {};
  },

  addAttributes() {
    return {
      alignment: {
        default: 'left',
        parseHTML: (el) => el.getAttribute('data-table-align') || el.style.marginLeft === 'auto' ? (el.style.marginRight === 'auto' ? 'center' : 'right') : 'left',
        renderHTML: (attrs) => ({
          'data-table-align': attrs.alignment,
          style: attrs.alignment === 'center' ? 'margin-left: auto; margin-right: auto;' : attrs.alignment === 'right' ? 'margin-left: auto; margin-right: 0;' : 'margin-left: 0;',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'table' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes, { class: 'letter-custom-table' }), ['tbody', 0]];
  },

  addProseMirrorPlugins() {
    return [
      columnResizing({
        handleWidth: 5,
        cellMinWidth: 25,
        lastColumnResizable: true,
      }),
      tableEditing(),
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (goToNextCell(1)(this.editor.state, this.editor.view.dispatch)) {
          return true;
        }
        // If at the last cell of the table, append a new row
        if (isInTable(this.editor.state)) {
          pmAddRowAfter(this.editor.state, this.editor.view.dispatch);
          return goToNextCell(1)(this.editor.state, this.editor.view.dispatch);
        }
        return false;
      },
      'Shift-Tab': () => goToNextCell(-1)(this.editor.state, this.editor.view.dispatch),
    };
  },
});

export const CustomTableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',

  extendNodeSchema(extension) {
    if (extension.name === 'tableRow') {
      return { tableRole: 'row' };
    }
    return {};
  },

  addAttributes() {
    return {
      rowHeight: {
        default: null,
        parseHTML: (el) => (el.getAttribute('data-row-height') ? Number(el.getAttribute('data-row-height')) : null),
        renderHTML: (attrs) => (attrs.rowHeight ? { 'data-row-height': String(attrs.rowHeight), style: `height: ${attrs.rowHeight}pt; min-height: ${attrs.rowHeight}pt;` } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'tr' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0];
  },
});

const commonCellAttributes = () => ({
  colspan: {
    default: 1,
    parseHTML: (el: HTMLElement) => Number(el.getAttribute('colspan') || 1),
    renderHTML: (attrs: Record<string, unknown>) => (Number(attrs.colspan) > 1 ? { colspan: attrs.colspan } : {}),
  },
  rowspan: {
    default: 1,
    parseHTML: (el: HTMLElement) => Number(el.getAttribute('rowspan') || 1),
    renderHTML: (attrs: Record<string, unknown>) => (Number(attrs.rowspan) > 1 ? { rowspan: attrs.rowspan } : {}),
  },
  colwidth: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const val = el.getAttribute('data-colwidth');
      return val ? val.split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n)) : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const cw = attrs.colwidth as number[] | null;
      return cw && cw.length ? { 'data-colwidth': cw.join(','), style: `width: ${cw[0]}px;` } : {};
    },
  },
  rowHeight: {
    default: null,
    parseHTML: (el: HTMLElement) => (el.getAttribute('data-row-height') ? Number(el.getAttribute('data-row-height')) : null),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.rowHeight ? { 'data-row-height': String(attrs.rowHeight) } : {}),
  },
  borderTop: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-top') || el.style.borderTop || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.borderTop ? { 'data-border-top': attrs.borderTop } : {}),
  },
  borderRight: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-right') || el.style.borderRight || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.borderRight ? { 'data-border-right': attrs.borderRight } : {}),
  },
  borderBottom: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-bottom') || el.style.borderBottom || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.borderBottom ? { 'data-border-bottom': attrs.borderBottom } : {}),
  },
  borderLeft: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-border-left') || el.style.borderLeft || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.borderLeft ? { 'data-border-left': attrs.borderLeft } : {}),
  },
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-bg') || el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.backgroundColor ? { 'data-cell-bg': attrs.backgroundColor } : {}),
  },
  textAlign: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-align') || el.style.textAlign || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.textAlign ? { 'data-cell-align': attrs.textAlign } : {}),
  },
  verticalAlign: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-cell-valign') || el.style.verticalAlign || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.verticalAlign ? { 'data-cell-valign': attrs.verticalAlign } : {}),
  },
  padding: {
    default: null,
    parseHTML: (el: HTMLElement) => (el.getAttribute('data-cell-padding') ? Number(el.getAttribute('data-cell-padding')) : null),
    renderHTML: (attrs: Record<string, unknown>) => (attrs.padding !== null && attrs.padding !== undefined ? { 'data-cell-padding': String(attrs.padding) } : {}),
  },
});

function buildCellInlineStyles(attrs: Record<string, unknown>, isHeader = false) {
  const styles: string[] = [];
  if (attrs.borderTop) styles.push(`border-top: ${attrs.borderTop}`);
  if (attrs.borderRight) styles.push(`border-right: ${attrs.borderRight}`);
  if (attrs.borderBottom) styles.push(`border-bottom: ${attrs.borderBottom}`);
  if (attrs.borderLeft) styles.push(`border-left: ${attrs.borderLeft}`);
  if (attrs.backgroundColor) styles.push(`background-color: ${attrs.backgroundColor}`);
  else if (isHeader) styles.push('background-color: #f8fafc');

  if (attrs.textAlign) styles.push(`text-align: ${attrs.textAlign}`);
  if (attrs.verticalAlign) styles.push(`vertical-align: ${attrs.verticalAlign}`);
  if (attrs.padding !== null && attrs.padding !== undefined) {
    styles.push(`padding: ${attrs.padding}pt`);
  }
  if (attrs.rowHeight) styles.push(`min-height: ${attrs.rowHeight}pt`);
  const cw = attrs.colwidth as number[] | null;
  if (cw && cw.length) styles.push(`width: ${cw[0]}px`);

  return styles.join('; ');
}

export const CustomTableCell = Node.create({
  name: 'tableCell',
  content: 'block+',
  isolating: true,

  extendNodeSchema(extension) {
    if (extension.name === 'tableCell') {
      return { tableRole: 'cell' };
    }
    return {};
  },

  addAttributes() {
    return commonCellAttributes();
  },

  parseHTML() {
    return [{ tag: 'td' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const inlineStyle = buildCellInlineStyles(node.attrs);
    const existingStyle = HTMLAttributes.style ? `${HTMLAttributes.style}; ` : '';
    return [
      'td',
      mergeAttributes(HTMLAttributes, {
        class: 'letter-custom-cell',
        style: `${existingStyle}${inlineStyle}`.trim() || undefined,
      }),
      0,
    ];
  },
});

export const CustomTableHeader = Node.create({
  name: 'tableHeader',
  content: 'block+',
  isolating: true,

  extendNodeSchema(extension) {
    if (extension.name === 'tableHeader') {
      return { tableRole: 'header_cell' };
    }
    return {};
  },

  addAttributes() {
    return commonCellAttributes();
  },

  parseHTML() {
    return [{ tag: 'th' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const inlineStyle = buildCellInlineStyles(node.attrs, true);
    const existingStyle = HTMLAttributes.style ? `${HTMLAttributes.style}; ` : '';
    return [
      'th',
      mergeAttributes(HTMLAttributes, {
        class: 'letter-custom-cell letter-custom-header',
        style: `${existingStyle}${inlineStyle}`.trim() || undefined,
      }),
      0,
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Table Generation & Manipulation Commands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a standard empty table node with specified rows and columns.
 */
export function createTableNode(schema: Schema, rowsCount: number, colsCount: number, withHeaderRow = false) {
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const headerType = schema.nodes.tableHeader || schema.nodes.tableCell;
  const cellType = schema.nodes.tableCell;
  const pType = schema.nodes.paragraph;

  const rows = [];
  for (let r = 0; r < rowsCount; r += 1) {
    const isHeader = withHeaderRow && r === 0;
    const type = isHeader ? headerType : cellType;
    const cells = [];
    for (let c = 0; c < colsCount; c += 1) {
      const p = pType.create({ textAlign: null, spaceBefore: 0, spaceAfter: 0 });
      cells.push(
        type.create(
          {
            colspan: 1,
            rowspan: 1,
            borderTop: '0.75pt solid #cbd5e1',
            borderRight: '0.75pt solid #cbd5e1',
            borderBottom: '0.75pt solid #cbd5e1',
            borderLeft: '0.75pt solid #cbd5e1',
            padding: 4,
          },
          [p],
        ),
      );
    }
    rows.push(rowType.create({}, cells));
  }
  return tableType.create({}, rows);
}

/**
 * Generates the reference Annexure-A Salary Structure table layout
 * as described in user requirements:
 * - Top-right "Annexure - A" header
 * - Centered "SALARY STRUCTURE & COMPENSATION DETAILS"
 * - Section column, Head of Account, Monthly, and Annual amounts
 * - Formatted sections A (Income), B (Provident Fund), C (Deductions), Net In-Hand, Total CTC
 */
export function createSalaryStructureTable(schema: Schema) {
  const tableType = schema.nodes.table;
  const rowType = schema.nodes.tableRow;
  const headerType = schema.nodes.tableHeader || schema.nodes.tableCell;
  const cellType = schema.nodes.tableCell;
  const pType = schema.nodes.paragraph;

  const text = (t: string) => schema.text(t);
  const boldText = (t: string) => schema.text(t, [schema.marks.bold.create()]);

  const makeCell = (
    content: string | (string | ReturnType<typeof schema.text>)[],
    options: {
      colspan?: number;
      rowspan?: number;
      colwidth?: number[];
      isHeader?: boolean;
      bold?: boolean;
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      verticalAlign?: 'top' | 'middle' | 'bottom';
      backgroundColor?: string;
    } = {},
  ) => {
    const type = options.isHeader ? headerType : cellType;
    const items = Array.isArray(content) ? content : [content];
    const nodes = items.map((it) => (typeof it === 'string' ? (options.bold ? boldText(it) : text(it)) : it));
    const p = pType.create(
      {
        textAlign: options.textAlign || 'left',
        spaceBefore: 0,
        spaceAfter: 0,
        lineHeight: 1.15,
      },
      nodes,
    );

    return type.create(
      {
        colspan: options.colspan ?? 1,
        rowspan: options.rowspan ?? 1,
        colwidth: options.colwidth ?? null,
        textAlign: options.textAlign ?? null,
        verticalAlign: options.verticalAlign ?? 'middle',
        backgroundColor: options.backgroundColor ?? null,
        padding: 3,
        borderTop: '0.75pt solid #000000',
        borderRight: '0.75pt solid #000000',
        borderBottom: '0.75pt solid #000000',
        borderLeft: '0.75pt solid #000000',
      },
      [p],
    );
  };

  const rows = [
    // Row 0: Top badge / label
    rowType.create({}, [
      makeCell('Annexure - A', {
        colspan: 4,
        isHeader: true,
        bold: true,
        textAlign: 'right',
        backgroundColor: '#f8fafc',
      }),
    ]),

    // Row 1: Title
    rowType.create({}, [
      makeCell('SALARY STRUCTURE & COMPENSATION BREAKDOWN', {
        colspan: 4,
        isHeader: true,
        bold: true,
        textAlign: 'center',
        backgroundColor: '#f1f5f9',
      }),
    ]),

    // Row 2: Table Column Headers
    rowType.create({}, [
      makeCell('Sec', { colwidth: [45], isHeader: true, bold: true, textAlign: 'center', backgroundColor: '#f8fafc' }),
      makeCell('Head Of Account', { colwidth: [280], isHeader: true, bold: true, textAlign: 'left', backgroundColor: '#f8fafc' }),
      makeCell('Current (INR/Mo)', { colwidth: [120], isHeader: true, bold: true, textAlign: 'right', backgroundColor: '#f8fafc' }),
      makeCell('Annual (INR/Yr)', { colwidth: [120], isHeader: true, bold: true, textAlign: 'right', backgroundColor: '#f8fafc' }),
    ]),

    // Row 3: Section A - Basic
    rowType.create({}, [
      makeCell('A', { rowspan: 4, bold: true, textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f8fafc' }),
      makeCell('Basic Salary'),
      makeCell('{{basic_salary}}', { textAlign: 'right' }),
      makeCell('{{basic_salary_annual}}', { textAlign: 'right' }),
    ]),
    // Row 4: HRA
    rowType.create({}, [
      makeCell('House Rent Allowance (HRA)'),
      makeCell('{{hra}}', { textAlign: 'right' }),
      makeCell('{{hra_annual}}', { textAlign: 'right' }),
    ]),
    // Row 5: Special Allowance
    rowType.create({}, [
      makeCell('Special Allowance'),
      makeCell('{{special_allowance}}', { textAlign: 'right' }),
      makeCell('{{special_allowance_annual}}', { textAlign: 'right' }),
    ]),
    // Row 6: Total Gross (A)
    rowType.create({}, [
      makeCell('Total Gross Earnings (A)', { bold: true }),
      makeCell('{{gross_salary}}', { bold: true, textAlign: 'right' }),
      makeCell('{{gross_salary_annual}}', { bold: true, textAlign: 'right' }),
    ]),

    // Row 7: Section B - Retirals / Employer contribution
    rowType.create({}, [
      makeCell('B', { rowspan: 3, bold: true, textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f8fafc' }),
      makeCell('Provident Fund (Employer Contribution)'),
      makeCell('{{pf_employer}}', { textAlign: 'right' }),
      makeCell('{{pf_employer_annual}}', { textAlign: 'right' }),
    ]),
    // Row 8: ESIC Employer
    rowType.create({}, [
      makeCell('ESIC (Employer Contribution)'),
      makeCell('{{esic_employer}}', { textAlign: 'right' }),
      makeCell('{{esic_employer_annual}}', { textAlign: 'right' }),
    ]),
    // Row 9: Total (B)
    rowType.create({}, [
      makeCell('Total Employer Contributions (B)', { bold: true }),
      makeCell('{{total_b}}', { bold: true, textAlign: 'right' }),
      makeCell('{{total_b_annual}}', { bold: true, textAlign: 'right' }),
    ]),

    // Row 10: Section C - Deductions
    rowType.create({}, [
      makeCell('C', { rowspan: 3, bold: true, textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#f8fafc' }),
      makeCell('Provident Fund (Employee Contribution)'),
      makeCell('{{pf_employee}}', { textAlign: 'right' }),
      makeCell('{{pf_employee_annual}}', { textAlign: 'right' }),
    ]),
    // Row 11: Professional Tax
    rowType.create({}, [
      makeCell('Professional Tax (PT)'),
      makeCell('{{pt}}', { textAlign: 'right' }),
      makeCell('{{pt_annual}}', { textAlign: 'right' }),
    ]),
    // Row 12: Total Deductions (C)
    rowType.create({}, [
      makeCell('Total Deductions (C)', { bold: true }),
      makeCell('{{total_c}}', { bold: true, textAlign: 'right' }),
      makeCell('{{total_c_annual}}', { bold: true, textAlign: 'right' }),
    ]),

    // Row 13: Net In-Hand
    rowType.create({}, [
      makeCell('Net In-Hand Salary [A - C]', { colspan: 2, bold: true, backgroundColor: '#f8fafc' }),
      makeCell('{{net_salary}}', { bold: true, textAlign: 'right', backgroundColor: '#f8fafc' }),
      makeCell('{{net_salary_annual}}', { bold: true, textAlign: 'right', backgroundColor: '#f8fafc' }),
    ]),

    // Row 14: Total CTC
    rowType.create({}, [
      makeCell('Total Cost to Company (CTC) [A + B]', { colspan: 2, bold: true, backgroundColor: '#e2e8f0' }),
      makeCell('{{salary}}', { bold: true, textAlign: 'right', backgroundColor: '#e2e8f0' }),
      makeCell('{{annual_salary}}', { bold: true, textAlign: 'right', backgroundColor: '#e2e8f0' }),
    ]),
  ];

  return tableType.create({}, rows);
}

/** Inserts a custom empty table at the current cursor position */
export function insertTable(editor: Editor, rows = 3, cols = 3, withHeaderRow = true) {
  const table = createTableNode(editor.schema, rows, cols, withHeaderRow);
  const { tr } = editor.state;
  const offset = tr.selection.from;
  tr.replaceSelectionWith(table).scrollIntoView();
  const resolved = tr.doc.resolve(offset + 1);
  tr.setSelection(Selection.near(resolved, 1));
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** Inserts the reference Annexure-A Salary Structure table */
export function insertSalaryStructure(editor: Editor) {
  const table = createSalaryStructureTable(editor.schema);
  const { tr } = editor.state;
  const offset = tr.selection.from;
  tr.replaceSelectionWith(table).scrollIntoView();
  const resolved = tr.doc.resolve(offset + 1);
  tr.setSelection(Selection.near(resolved, 1));
  editor.view.dispatch(tr);
  editor.view.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell & Table Manipulation Actions
// ─────────────────────────────────────────────────────────────────────────────

export const addRowAbove = (editor: Editor) => {
  pmAddRowBefore(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const addRowBelow = (editor: Editor) => {
  pmAddRowAfter(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const deleteRow = (editor: Editor) => {
  pmDeleteRow(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const addColLeft = (editor: Editor) => {
  pmAddColumnBefore(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const addColRight = (editor: Editor) => {
  pmAddColumnAfter(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const deleteCol = (editor: Editor) => {
  pmDeleteColumn(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const deleteCurrentTable = (editor: Editor) => {
  pmDeleteTable(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const mergeSelectedCells = (editor: Editor) => {
  pmMergeCells(editor.state, editor.view.dispatch);
  editor.view.focus();
};

export const splitCurrentCell = (editor: Editor) => {
  pmSplitCell(editor.state, editor.view.dispatch);
  editor.view.focus();
};

/** Sets an attribute across all selected cells in a table */
export function updateCellAttribute(editor: Editor, name: string, value: unknown) {
  setCellAttr(name, value)(editor.state, editor.view.dispatch);
  editor.view.focus();
}

/** Configures borders for selected cells based on side and styling */
export function setCellBorder(editor: Editor, config: BorderConfig) {
  const spec = config.style === 'none' || config.thickness === 0
    ? 'none'
    : `${config.thickness ?? 0.75}pt ${config.style ?? 'solid'} ${config.color ?? '#000000'}`;

  const { side } = config;
  if (side === 'all' || side === 'top' || side === 'outside') {
    setCellAttr('borderTop', spec)(editor.state, editor.view.dispatch);
  }
  if (side === 'all' || side === 'right' || side === 'outside') {
    setCellAttr('borderRight', spec)(editor.state, editor.view.dispatch);
  }
  if (side === 'all' || side === 'bottom' || side === 'outside') {
    setCellAttr('borderBottom', spec)(editor.state, editor.view.dispatch);
  }
  if (side === 'all' || side === 'left' || side === 'outside') {
    setCellAttr('borderLeft', spec)(editor.state, editor.view.dispatch);
  }
  if (side === 'none') {
    setCellAttr('borderTop', 'none')(editor.state, editor.view.dispatch);
    setCellAttr('borderRight', 'none')(editor.state, editor.view.dispatch);
    setCellAttr('borderBottom', 'none')(editor.state, editor.view.dispatch);
    setCellAttr('borderLeft', 'none')(editor.state, editor.view.dispatch);
  }
  editor.view.focus();
}

/** Distribute column widths equally across all columns in the active table */
export function distributeColumnsEqually(editor: Editor) {
  if (!isInTable(editor.state)) return;
  const rect = selectedRect(editor.state);
  const totalCols = rect.map.width;
  if (totalCols <= 0) return;

  const totalWidth = 560; // default standard table width in pixels
  const colWidth = Math.round(totalWidth / totalCols);

  rect.map.map.forEach((pos) => {
    const cellNode = rect.table.nodeAt(pos);
    if (cellNode) {
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(rect.tableStart + pos, null, {
          ...cellNode.attrs,
          colwidth: [colWidth],
        }),
      );
    }
  });
  editor.view.focus();
}

/** Inspect current table and selection state */
export function getTableSelectionInfo(state: EditorState) {
  const active = isInTable(state);
  if (!active) {
    return {
      isInTable: false,
      canMerge: false,
      canSplit: false,
      cellAttrs: null,
      rowCount: 0,
      colCount: 0,
    };
  }

  let canMerge = false;
  let canSplit = false;
  let cellAttrs: Record<string, unknown> | null = null;

  try {
    const sel = state.selection;
    if (sel instanceof CellSelection) {
      canMerge = true;
    }
    const rect = selectedRect(state);
    const cell = rect.table.nodeAt(rect.map.map[rect.top * rect.map.width + rect.left]);
    if (cell) {
      cellAttrs = cell.attrs;
      if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) {
        canSplit = true;
      }
    }
    return {
      isInTable: true,
      canMerge,
      canSplit,
      cellAttrs,
      rowCount: rect.map.height,
      colCount: rect.map.width,
    };
  } catch {
    return {
      isInTable: true,
      canMerge,
      canSplit,
      cellAttrs,
      rowCount: 0,
      colCount: 0,
    };
  }
}
