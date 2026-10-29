import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  CustomTable,
  CustomTableRow,
  CustomTableCell,
  CustomTableHeader,
  createTableNode,
  createSalaryStructureTable,
  insertTable,
  insertSalaryStructure,
  addRowAbove,
  addRowBelow,
  deleteRow,
  addColLeft,
  addColRight,
  deleteCol,
  deleteCurrentTable,
  mergeSelectedCells,
  splitCurrentCell,
  setCellBorder,
  updateCellAttribute,
  distributeColumnsEqually,
  getTableSelectionInfo,
} from './table-extension';
import { parseDocument, type DocNode } from '../../../../backend/src/modules/documents/rich-document';

function createTestEditor(initialContent?: Record<string, unknown>) {
  return new Editor({
    extensions: [
      StarterKit,
      CustomTable,
      CustomTableRow,
      CustomTableCell,
      CustomTableHeader,
    ],
    content: initialContent || {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Introduction text before table.' }],
        },
      ],
    },
  });
}

describe('Custom Table Builder & Editor Extension', () => {
  it('creates an empty table node with custom dimensions and header row', () => {
    const editor = createTestEditor();
    const tableNode = createTableNode(editor.schema, 3, 4, true);

    expect(tableNode.type.name).toBe('table');
    expect(tableNode.childCount).toBe(3); // 3 rows
    expect(tableNode.child(0).childCount).toBe(4); // 4 header cells
    expect(tableNode.child(0).child(0).type.name).toBe('tableHeader');
    expect(tableNode.child(1).child(0).type.name).toBe('tableCell');
    editor.destroy();
  });

  it('inserts a table into the editor and inspects selection info', () => {
    const editor = createTestEditor();
    expect(getTableSelectionInfo(editor.state).isInTable).toBe(false);

    insertTable(editor, 3, 3, true);

    const info = getTableSelectionInfo(editor.state);
    expect(info.isInTable).toBe(true);
    expect(info.rowCount).toBe(3);
    expect(info.colCount).toBe(3);

    const docJson = editor.getJSON();
    const tableInDoc = docJson.content?.find((n) => n.type === 'table');
    expect(tableInDoc).toBeDefined();
    expect(tableInDoc?.content?.length).toBe(3);
    editor.destroy();
  });

  it('inserts the Annexure-A Salary Structure with accurate multi-tier sections and placeholders', () => {
    const editor = createTestEditor();
    insertSalaryStructure(editor);

    const docJson = editor.getJSON();
    const tableInDoc = docJson.content?.find((n) => n.type === 'table');
    expect(tableInDoc).toBeDefined();

    // Verify row count of salary structure
    const rows = (tableInDoc?.content || []) as Array<{ content?: Array<{ attrs?: Record<string, unknown> }> }>;
    expect(rows.length).toBeGreaterThanOrEqual(14);

    // Verify Annexure header row
    const annexureRow = rows[0];
    expect(annexureRow.content?.[0].attrs?.colspan).toBe(4);
    expect(annexureRow.content?.[0].attrs?.textAlign).toBe('center');

    // Verify Section A (Basic, HRA, Special Allowance, Total Gross)
    const basicRow = rows[3];
    expect(basicRow.content?.[0].attrs?.rowspan).toBe(3); // "INCOME" Section code spans 3 rows
    expect(basicRow.content?.[0].attrs?.verticalAlign).toBe('middle');

    // Verify presence of salary placeholders
    const jsonStr = JSON.stringify(tableInDoc);
    expect(jsonStr).toContain('{{basic_salary}}');
    expect(jsonStr).toContain('{{hra}}');
    expect(jsonStr).toContain('{{gross_salary}}');
    expect(jsonStr).toContain('{{pf_employer}}');
    expect(jsonStr).toContain('{{net_salary}}');
    expect(jsonStr).toContain('{{annual_salary}}');

    editor.destroy();
  });

  it('performs row and column modifications: adding and deleting', () => {
    const editor = createTestEditor();
    insertTable(editor, 3, 3, false);

    let info = getTableSelectionInfo(editor.state);
    expect(info.rowCount).toBe(3);
    expect(info.colCount).toBe(3);

    // Insert row below
    addRowBelow(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.rowCount).toBe(4);

    // Insert row above
    addRowAbove(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.rowCount).toBe(5);

    // Delete row
    deleteRow(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.rowCount).toBe(4);

    // Insert column right
    addColRight(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.colCount).toBe(4);

    // Insert column left
    addColLeft(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.colCount).toBe(5);

    // Delete column
    deleteCol(editor);
    info = getTableSelectionInfo(editor.state);
    expect(info.colCount).toBe(4);

    editor.destroy();
  });

  it('updates cell styling attributes: background, verticalAlign, textAlign, padding', () => {
    const editor = createTestEditor();
    insertTable(editor, 2, 2, false);

    updateCellAttribute(editor, 'backgroundColor', '#ccfbf1');
    updateCellAttribute(editor, 'verticalAlign', 'middle');
    updateCellAttribute(editor, 'textAlign', 'right');
    updateCellAttribute(editor, 'padding', 6);

    const info = getTableSelectionInfo(editor.state);
    expect(info.cellAttrs?.backgroundColor).toBe('#ccfbf1');
    expect(info.cellAttrs?.verticalAlign).toBe('middle');
    expect(info.cellAttrs?.textAlign).toBe('right');
    expect(info.cellAttrs?.padding).toBe(6);

    editor.destroy();
  });

  it('configures borders independently: all, top, bottom, and none', () => {
    const editor = createTestEditor();
    insertTable(editor, 2, 2, false);

    // Apply all borders
    setCellBorder(editor, { side: 'all', thickness: 1.5, style: 'dashed', color: '#0d9488' });
    let info = getTableSelectionInfo(editor.state);
    expect(info.cellAttrs?.borderTop).toBe('1.5pt dashed #0d9488');
    expect(info.cellAttrs?.borderBottom).toBe('1.5pt dashed #0d9488');
    expect(info.cellAttrs?.borderLeft).toBe('1.5pt dashed #0d9488');
    expect(info.cellAttrs?.borderRight).toBe('1.5pt dashed #0d9488');

    // Customize top border only
    setCellBorder(editor, { side: 'top', thickness: 2, style: 'solid', color: '#000000' });
    info = getTableSelectionInfo(editor.state);
    expect(info.cellAttrs?.borderTop).toBe('2pt solid #000000');
    expect(info.cellAttrs?.borderBottom).toBe('1.5pt dashed #0d9488');

    // Remove borders
    setCellBorder(editor, { side: 'none' });
    info = getTableSelectionInfo(editor.state);
    expect(info.cellAttrs?.borderTop).toBe('none');
    expect(info.cellAttrs?.borderBottom).toBe('none');

    editor.destroy();
  });

  it('distributes column widths equally', () => {
    const editor = createTestEditor();
    insertTable(editor, 2, 4, false);

    distributeColumnsEqually(editor);

    const docJson = editor.getJSON();
    const table = docJson.content?.find((n) => n.type === 'table');
    const firstRow = table?.content?.[0] as { content?: Array<{ attrs?: Record<string, unknown> }> } | undefined;
    // Total width 560 / 4 cols = 140px
    firstRow?.content?.forEach((cell) => {
      expect(cell.attrs?.colwidth).toEqual([140]);
    });

    editor.destroy();
  });

  it('converts editor document with custom table to sanitized richDocument model', () => {
    const editor = createTestEditor();
    insertSalaryStructure(editor);

    const docJson = editor.getJSON();
    const sanitized = parseDocument('OFFER_LETTER', docJson);

    expect(sanitized.type).toBe('doc');
    const tableBlock = (sanitized.content ?? []).find((n) => n.type === 'table');
    expect(tableBlock).toBeDefined();

    // Verify table attributes and row nesting
    expect(tableBlock?.content?.length).toBeGreaterThanOrEqual(14);
    const row0 = tableBlock?.content?.[0] as DocNode;
    expect(row0.type).toBe('tableRow');
    const cell0 = row0.content?.[0] as DocNode;
    expect(['tableCell', 'tableHeader']).toContain(cell0.type);
    expect(cell0.attrs?.colspan).toBe(4);
    expect(cell0.attrs?.textAlign).toBe('center');

    editor.destroy();
  });
});
