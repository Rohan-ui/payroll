import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Trash2 } from 'lucide-react';
import type { LetterheadBox, LetterheadElement, LetterheadImageSlot } from '../../api/onboarding.api';
import { fieldClass, labelClass } from './onboarding-format';
import { IMAGE_LABEL } from './LetterheadCanvas';
import { ELEMENT_FONTS, elementName, type GridSpec, type LayerMove } from './letterhead-design';
import type { Area } from './letterhead-geometry';

export const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const dangerClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50';
const iconClass = 'p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-40 disabled:hover:bg-transparent';
const sectionClass = 'pt-4 border-t border-slate-200 dark:border-[#2B293E] space-y-3';
const ROTATION_PRESETS = [-45, 0, 45, 90];

export const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div>
    <label htmlFor={id} className={labelClass}>{label}</label>
    {children}
    {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
  </div>
);

/**
 * A number field kept in step with the page: it shows the current value,
 * passes on what is typed once it is a number in range, and shows the current
 * value again when left.
 */
export const MmInput: React.FC<{ id: string; label: string; hint?: string; value: number; min: number; max: number; step: number; readOnly?: boolean; onCommit: (mm: number) => void }> = ({
  id, label, hint, value, min, max, step, readOnly, onCommit,
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft((d) => (d.trim() !== '' && Number(d) === value ? d : String(value))), [value]);
  const inRange = (text: string) => text.trim() !== '' && Number.isFinite(Number(text)) && Number(text) >= min && Number(text) <= max;
  return (
    <Field id={id} label={label} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        readOnly={readOnly}
        aria-invalid={!inRange(draft)}
        onChange={(e) => {
          setDraft(e.target.value);
          if (inRange(e.target.value)) onCommit(Number(e.target.value));
        }}
        onBlur={() => setDraft(String(value))}
        className={fieldClass}
      />
    </Field>
  );
};

/** A button that opens the file picker for a PNG or JPEG. */
export const ImagePicker: React.FC<{ label: string; ariaLabel?: string; disabled?: boolean; onFile: (file: File) => void }> = ({ label, ariaLabel, disabled, onFile }) => (
  <label className={`${actionClass} inline-block cursor-pointer focus-within:ring-2 focus-within:ring-teal-500 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
    {label}
    <input
      type="file"
      accept="image/png,image/jpeg,.png,.jpg,.jpeg"
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      className="sr-only"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) onFile(file);
      }}
    />
  </label>
);

const Toggle: React.FC<{ on: boolean; onLabel: string; offLabel: string; disabled?: boolean; onClick: () => void; icon: [React.ElementType, React.ElementType] }> = ({ on, onLabel, offLabel, disabled, onClick, icon }) => {
  const Icon = on ? icon[0] : icon[1];
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick} className={`${actionClass} inline-flex items-center gap-1.5`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {on ? onLabel : offLabel}
    </button>
  );
};

/** Turn in degrees: typed, or one of the usual angles. */
const RotationField: React.FC<{ id: string; value: number; readOnly: boolean; onCommit: (degrees: number) => void }> = ({ id, value, readOnly, onCommit }) => (
  <div className="space-y-1.5">
    <MmInput id={id} label="Rotation (°)" hint="Clockwise; −360 to 360. Or drag the round handle on the page." value={value} min={-360} max={360} step={1} readOnly={readOnly} onCommit={(n) => onCommit(Math.round(n * 10) / 10)} />
    <div role="group" aria-label="Usual angles" className="flex flex-wrap gap-1">
      {ROTATION_PRESETS.map((angle) => (
        <button key={angle} type="button" disabled={readOnly} aria-pressed={value === angle} onClick={() => onCommit(angle)} className={`${actionClass} tabular-nums ${value === angle ? 'border-teal-500 text-teal-700 dark:text-teal-300' : ''}`}>{angle}°</button>
      ))}
    </div>
  </div>
);

export interface SlotSelection {
  kind: 'slot';
  slot: LetterheadImageSlot;
  box: LetterheadBox;
  automatic: boolean;
  area: Area;
  hidden: boolean;
  locked: boolean;
}

export interface ElementSelection {
  kind: 'element';
  element: LetterheadElement;
  page: Area;
  canRaise: boolean;
  canLower: boolean;
}

/** The selected object's settings: where it is, its size and turn, and for a watermark its look, layer and copies. */
export const SelectionPanel: React.FC<{
  id: string;
  selection: SlotSelection | ElementSelection | null;
  editable: boolean;
  busy: boolean;
  error: string | null;
  onBox: (patch: Partial<LetterheadBox>, field: string) => void;
  onAutomatic: () => void;
  onElement: (patch: Partial<LetterheadElement>, field: string) => void;
  onLayer: (move: LayerMove) => void;
  onDuplicate: () => void;
  onGrid: (spec: GridSpec) => string | null;
  onToggle: (flag: 'hidden' | 'locked') => void;
  onReplace: (file: File) => void;
  onDelete: () => void;
}> = ({ id, selection, editable, busy, error, onBox, onAutomatic, onElement, onLayer, onDuplicate, onGrid, onToggle, onReplace, onDelete }) => {
  const [grid, setGrid] = useState<GridSpec>({ rows: 3, columns: 3, gapX: 20, gapY: 20 });
  const [gridError, setGridError] = useState<string | null>(null);
  if (!selection) return <p className="text-sm text-slate-500">Select the logo, artwork or a watermark on the page, or in Layers, to place it exactly.</p>;

  const isSlot = selection.kind === 'slot';
  const locked = isSlot ? selection.locked : selection.element.locked;
  const hidden = isSlot ? selection.hidden : selection.element.hidden;
  const readOnly = !editable || locked;
  const box = isSlot ? selection.box : selection.element;
  const area = isSlot ? selection.area : selection.page;
  const name = isSlot ? IMAGE_LABEL[selection.slot] : elementName(selection.element);
  const set = (patch: Partial<LetterheadBox>, field: string) => (isSlot ? onBox(patch, field) : onElement(patch, field));
  const element = isSlot ? null : selection.element;
  const canRaise = !isSlot && selection.canRaise;
  const canLower = !isSlot && selection.canLower;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-bold break-words">{name}</h4>
        <p className="text-xs text-slate-500">
          {isSlot
            ? `${selection.automatic ? 'Placed automatically. Move, resize or turn it to place it yourself.' : 'Placed by you.'} Measured from the top-left of the ${selection.slot === 'footer' ? 'footer' : 'header'}.`
            : `Measured from the top-left of the page. ${selection.element.aboveText ? 'In front of the letter text.' : 'Behind the letter text.'}`}
        </p>
        {locked && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Locked: unlock it to move, resize or turn it.</p>}
        {hidden && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Hidden: not shown on the page or printed.</p>}
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Toggle on={locked} onLabel="Unlock" offLabel="Lock" disabled={!editable} onClick={() => onToggle('locked')} icon={[LockOpen, Lock]} />
        <Toggle on={hidden} onLabel="Show" offLabel="Hide" disabled={!editable} onClick={() => onToggle('hidden')} icon={[Eye, EyeOff]} />
        {element && <button type="button" disabled={!editable} onClick={onDuplicate} className={actionClass}>Duplicate</button>}
        {editable && (!element || element.kind === 'IMAGE') && <ImagePicker label={busy ? 'Working…' : 'Replace image'} ariaLabel={`Replace the image of ${name.toLowerCase()}`} disabled={busy} onFile={onReplace} />}
        <button type="button" disabled={!editable || busy} onClick={onDelete} className={`${dangerClass} inline-flex items-center gap-1.5`}><Trash2 className="w-3.5 h-3.5" aria-hidden="true" />Delete</button>
      </div>

      {element?.kind === 'TEXT' && (
        <div className={sectionClass}>
          <Field id={`${id}-text`} label="Text">
            <textarea id={`${id}-text`} rows={2} maxLength={200} value={element.text ?? ''} readOnly={!editable} onChange={(e) => onElement({ text: e.target.value }, 'text')} className={fieldClass} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${id}-font`} label="Font">
              <select id={`${id}-font`} value={element.fontFamily ?? 'helvetica'} disabled={!editable} onChange={(e) => onElement({ fontFamily: e.target.value as LetterheadElement['fontFamily'] }, 'font')} className={fieldClass}>
                {ELEMENT_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </Field>
            <MmInput id={`${id}-size`} label="Font size (pt)" value={element.fontSizePt ?? 12} min={6} max={200} step={1} readOnly={!editable} onCommit={(n) => onElement({ fontSizePt: Math.round(n * 10) / 10 }, 'size')} />
            <Field id={`${id}-color`} label="Colour">
              <input id={`${id}-color`} type="color" value={element.color ?? '#000000'} disabled={!editable} onChange={(e) => onElement({ color: e.target.value }, 'color')} className="h-9 w-full rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] p-1" />
            </Field>
            <Field id={`${id}-align`} label="Alignment">
              <select id={`${id}-align`} value={element.align ?? 'center'} disabled={!editable} onChange={(e) => onElement({ align: e.target.value as LetterheadElement['align'] }, 'align')} className={fieldClass}>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </Field>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={element.bold} disabled={!editable} onChange={(e) => onElement({ bold: e.target.checked }, 'bold')} />Bold</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={element.italic} disabled={!editable} onChange={(e) => onElement({ italic: e.target.checked }, 'italic')} />Italic</label>
          </div>
        </div>
      )}

      <div className={sectionClass}>
        <div className="grid grid-cols-2 gap-3">
          <MmInput id={`${id}-x`} label="From left (mm)" value={box.x} min={0} max={area.width} step={0.5} readOnly={readOnly} onCommit={(n) => set({ x: n }, 'x')} />
          <MmInput id={`${id}-y`} label="From top (mm)" value={box.y} min={0} max={area.height} step={0.5} readOnly={readOnly} onCommit={(n) => set({ y: n }, 'y')} />
          <MmInput id={`${id}-width`} label="Width (mm)" value={box.width} min={3} max={area.width} step={0.5} readOnly={readOnly} onCommit={(n) => set({ width: n }, 'width')} />
          <MmInput id={`${id}-height`} label="Height (mm)" value={box.height} min={3} max={area.height} step={0.5} readOnly={readOnly} onCommit={(n) => set({ height: n }, 'height')} />
        </div>
        <RotationField id={`${id}-rotation`} value={box.rotation ?? 0} readOnly={readOnly} onCommit={(degrees) => set({ rotation: degrees }, 'rotation')} />
        {isSlot && (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!selection.box.stretch}
                disabled={readOnly}
                // Back in proportion, the height follows the width.
                onChange={(e) => onBox(e.target.checked ? { stretch: false, width: selection.box.width } : { stretch: true }, 'stretch')}
              />
              Keep proportions
            </label>
            <p className="mt-1 text-xs text-slate-500">Untick to stretch the image to fill its box exactly. Hold Shift while dragging a corner to resize the box freely.</p>
          </div>
        )}
        {isSlot && editable && !locked && !selection.automatic && <button type="button" onClick={onAutomatic} className={actionClass}>Place automatically</button>}
      </div>

      {element && (
        <>
          <div className={sectionClass}>
            <label htmlFor={`${id}-opacity`} className={labelClass}>Opacity</label>
            <div className="flex items-center gap-3">
              <input
                id={`${id}-opacity`}
                type="range"
                min={0}
                max={100}
                step={10}
                value={Math.round(element.opacity * 100)}
                disabled={!editable}
                aria-valuetext={`${Math.round(element.opacity * 100)} %`}
                onChange={(e) => onElement({ opacity: Number(e.target.value) / 100 }, 'opacity')}
                className="flex-1 accent-teal-600"
              />
              <output htmlFor={`${id}-opacity`} className="w-12 text-right text-sm tabular-nums">{Math.round(element.opacity * 100)}%</output>
            </div>
            <MmInput id={`${id}-opacity-exact`} label="Exact opacity (%)" value={Math.round(element.opacity * 100)} min={0} max={100} step={1} readOnly={!editable} onCommit={(n) => onElement({ opacity: Math.round(n) / 100 }, 'opacity')} />
          </div>

          <div className={sectionClass}>
            <h5 className="text-sm font-semibold">Layer</h5>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!editable || !canRaise} onClick={() => onLayer('forward')} className={actionClass}>Bring forward</button>
              <button type="button" disabled={!editable || !canLower} onClick={() => onLayer('backward')} className={actionClass}>Send backward</button>
              <button type="button" disabled={!editable || !canRaise} onClick={() => onLayer('front')} className={actionClass}>Bring to front</button>
              <button type="button" disabled={!editable || !canLower} onClick={() => onLayer('back')} className={actionClass}>Send to back</button>
            </div>
            <p className="text-xs text-slate-500">Watermarks normally sit behind the letter text. In front, they cover it on the page but never stop you typing.</p>
          </div>

          <fieldset className={sectionClass}>
            <legend className="text-sm font-semibold">Duplicate in a grid</legend>
            <p className="text-xs text-slate-500">Replaces this watermark with copies in rows and columns, centred on the page. Each copy can be moved and changed on its own afterwards.</p>
            <div className="grid grid-cols-2 gap-3">
              <MmInput id={`${id}-rows`} label="Rows" value={grid.rows} min={1} max={12} step={1} readOnly={!editable} onCommit={(n) => setGrid((g) => ({ ...g, rows: Math.round(n) }))} />
              <MmInput id={`${id}-columns`} label="Columns" value={grid.columns} min={1} max={12} step={1} readOnly={!editable} onCommit={(n) => setGrid((g) => ({ ...g, columns: Math.round(n) }))} />
              <MmInput id={`${id}-gap-x`} label="Horizontal spacing (mm)" value={grid.gapX} min={0} max={100} step={1} readOnly={!editable} onCommit={(n) => setGrid((g) => ({ ...g, gapX: n }))} />
              <MmInput id={`${id}-gap-y`} label="Vertical spacing (mm)" value={grid.gapY} min={0} max={100} step={1} readOnly={!editable} onCommit={(n) => setGrid((g) => ({ ...g, gapY: n }))} />
            </div>
            {gridError && <p role="alert" className="text-xs text-red-700">{gridError}</p>}
            <button type="button" disabled={!editable} onClick={() => setGridError(onGrid(grid))} className={actionClass}>Generate {grid.rows * grid.columns} watermarks</button>
          </fieldset>
        </>
      )}
    </div>
  );
};

export interface LayerSlot { slot: LetterheadImageSlot; hidden: boolean; locked: boolean; printed: boolean }

/**
 * Every object on the page, top layer first: watermarks in front of the
 * letter text, the header and footer images, the letter text itself, and the
 * watermarks behind it. Each can be selected, shown or hidden, locked, and
 * deleted; watermarks can also be moved up or down a layer.
 */
export const LayersPanel: React.FC<{
  elements: LetterheadElement[];
  slots: LayerSlot[];
  selected: string | null;
  editable: boolean;
  onSelect: (key: string) => void;
  onToggle: (key: string, flag: 'hidden' | 'locked') => void;
  onLayer: (id: string, move: 'forward' | 'backward') => void;
  onDelete: (key: string) => void;
  limits: (id: string) => { canRaise: boolean; canLower: boolean };
}> = ({ elements, slots, selected, editable, onSelect, onToggle, onLayer, onDelete, limits }) => {
  const front = elements.filter((e) => e.aboveText).reverse();
  const behind = elements.filter((e) => !e.aboveText).reverse();
  const row = (key: string, name: string, state: { hidden: boolean; locked: boolean }, extra?: React.ReactNode, note?: string) => (
    <li key={key} className={`flex items-center gap-1 rounded-lg px-1.5 py-1 ${selected === key ? 'bg-teal-50 dark:bg-teal-500/10 ring-1 ring-teal-300' : ''}`}>
      <button type="button" onClick={() => onSelect(key)} aria-pressed={selected === key} className={`flex-1 min-w-0 text-left text-sm px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${state.hidden ? 'text-slate-400 line-through' : ''}`}>
        <span className="block truncate">{name}</span>
        {note && <span className="block text-[11px] text-slate-500 no-underline">{note}</span>}
      </button>
      <button type="button" disabled={!editable} onClick={() => onToggle(key, 'hidden')} aria-pressed={state.hidden} aria-label={`${state.hidden ? 'Show' : 'Hide'} ${name}`} title={state.hidden ? 'Show' : 'Hide'} className={iconClass}>
        {state.hidden ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
      <button type="button" disabled={!editable} onClick={() => onToggle(key, 'locked')} aria-pressed={state.locked} aria-label={`${state.locked ? 'Unlock' : 'Lock'} ${name}`} title={state.locked ? 'Unlock' : 'Lock'} className={iconClass}>
        {state.locked ? <Lock className="w-4 h-4" aria-hidden="true" /> : <LockOpen className="w-4 h-4" aria-hidden="true" />}
      </button>
      {extra}
      <button type="button" disabled={!editable} onClick={() => onDelete(key)} aria-label={`Delete ${name}`} title="Delete" className={iconClass}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
    </li>
  );
  const elementRow = (e: LetterheadElement) => {
    const { canRaise, canLower } = limits(e.id);
    const name = elementName(e);
    return row(e.id, name, e, (
      <>
        <button type="button" disabled={!editable || !canRaise} onClick={() => onLayer(e.id, 'forward')} aria-label={`Move ${name} up a layer`} title="Up a layer" className={iconClass}><ArrowUp className="w-4 h-4" aria-hidden="true" /></button>
        <button type="button" disabled={!editable || !canLower} onClick={() => onLayer(e.id, 'backward')} aria-label={`Move ${name} down a layer`} title="Down a layer" className={iconClass}><ArrowDown className="w-4 h-4" aria-hidden="true" /></button>
      </>
    ));
  };
  const divider = (text: string) => <li aria-hidden="true" className="px-2 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{text}</li>;
  return (
    <ul aria-label="Layers, top first" className="space-y-0.5">
      {front.length > 0 && divider('In front of the letter text')}
      {front.map(elementRow)}
      {slots.length > 0 && divider('Header and footer')}
      {slots.map((s) => row(s.slot, IMAGE_LABEL[s.slot], s, undefined, s.printed ? undefined : 'Not printed: header artwork takes its place'))}
      <li className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-white/5 text-sm text-slate-600 dark:text-slate-300">Letter text</li>
      {behind.length > 0 && divider('Behind the letter text')}
      {behind.map(elementRow)}
      {elements.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">No watermarks yet. Add one above.</li>}
    </ul>
  );
};
