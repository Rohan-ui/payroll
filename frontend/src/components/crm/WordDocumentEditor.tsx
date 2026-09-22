'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Quote, RemoveFormatting, Maximize2, Minimize2,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2, Minus, FileText,
  Sparkles, Check
} from 'lucide-react';

interface WordDocumentEditorProps {
  label?: string;
  value: string;
  onChange: (content: string) => void;
  placeholder?: string;
  minHeight?: string;
  maxHeight?: string;
  showCategoryTag?: string;
}

export default function WordDocumentEditor({
  label = 'Document & Scope Editor',
  value,
  onChange,
  placeholder = 'Write proposal content, scope of work, deliverables, and commercial terms...',
  minHeight = '180px',
  maxHeight = '280px',
  showCategoryTag
}: WordDocumentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fullscreenEditorRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Sync content when value changes externally
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
    if (fullscreenEditorRef.current && fullscreenEditorRef.current.innerHTML !== value) {
      fullscreenEditorRef.current.innerHTML = value || '';
    }
    updateStats(value || '');
  }, [value]);

  const updateStats = (html: string) => {
    const text = html.replace(/<[^>]*>?/gm, ' ').trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    setWordCount(words);
    setCharCount(text.length);
  };

  const executeCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    const activeRef = isFullscreen ? fullscreenEditorRef.current : editorRef.current;
    if (activeRef) {
      const html = activeRef.innerHTML;
      onChange(html);
      updateStats(html);
      activeRef.focus();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML;
    onChange(html);
    updateStats(html);
  };

  const renderToolbar = (isFull: boolean = false) => (
    <div className="bg-slate-100/90 backdrop-blur-sm p-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Style Controls */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => executeCommand('bold')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5 font-bold" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('italic')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('underline')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('strikeThrough')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 hover:text-slate-900 transition-colors"
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Headings */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => executeCommand('formatBlock', '<h3>')}
            className="px-2 py-1 hover:bg-slate-100 rounded text-slate-700 font-bold text-xs flex items-center gap-1"
            title="Heading 1"
          >
            <Heading1 className="w-3.5 h-3.5" />
            <span className="text-[10px]">H1</span>
          </button>
          <button
            type="button"
            onClick={() => executeCommand('formatBlock', '<h4>')}
            className="px-2 py-1 hover:bg-slate-100 rounded text-slate-700 font-bold text-xs flex items-center gap-1"
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
            <span className="text-[10px]">H2</span>
          </button>
          <button
            type="button"
            onClick={() => executeCommand('formatBlock', '<p>')}
            className="px-2 py-1 hover:bg-slate-100 rounded text-slate-600 text-xs"
            title="Normal Paragraph"
          >
            <span className="text-[10px] font-semibold">Body</span>
          </button>
        </div>

        {/* Lists & Quotes */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => executeCommand('insertUnorderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('insertOrderedList')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('formatBlock', '<blockquote>')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Blockquote"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('insertHorizontalRule')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Insert Divider"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Alignment */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs hidden sm:flex">
          <button
            type="button"
            onClick={() => executeCommand('justifyLeft')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('justifyCenter')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('justifyRight')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-700 transition-colors"
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Undo / Redo & Clear */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => executeCommand('undo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('redo')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => executeCommand('removeFormat')}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-rose-600 transition-colors"
            title="Clear Formatting"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stats & Expand to Fullscreen Screen Mode */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-slate-500 hidden md:inline-block">
          {wordCount} words • {charCount} chars
        </span>

        {showCategoryTag && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-bold">
            {showCategoryTag}
          </span>
        )}

        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
            isFull
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
          }`}
          title={isFull ? 'Exit Full Screen' : 'Open in Bigger Screen (Word Document Mode)'}
        >
          {isFull ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Done (Return)</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Bigger Screen</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>{label}</span>
          </label>
          <span className="text-[10px] text-slate-400">
            Rich Executive Proposal Editor
          </span>
        </div>
      )}

      {/* STANDARD INLINE EDITOR */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        {renderToolbar(false)}

        <div
          ref={editorRef}
          contentEditable
          dangerouslySetInnerHTML={{ __html: value }}
          onInput={handleInput}
          data-placeholder={placeholder}
          style={{ minHeight, maxHeight }}
          className="p-4 overflow-y-auto text-xs text-slate-800 focus:outline-none prose prose-xs max-w-none leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
        />
      </div>

      {/* DEDICATED BIGGER SCREEN / FULLSCREEN WORD PROCESSOR MODAL */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col animate-in fade-in-50 duration-200">
          {/* Fullscreen Header */}
          <div className="bg-slate-900 px-6 py-3 border-b border-slate-800 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Voogyo Document Editor & Proposal Word Suite</span>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded text-[10px] font-mono">
                    Full Screen Mode
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">
                  {wordCount} words • {charCount} characters • Executive Scope & Deliverables
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Save & Return to Proposal</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Toolbar */}
          <div className="bg-slate-100 border-b border-slate-200 px-6 py-1">
            {renderToolbar(true)}
          </div>

          {/* Fullscreen Canvas (Word Document Page Look) */}
          <div className="flex-1 overflow-y-auto p-8 bg-slate-200/80 flex justify-center">
            <div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl border border-slate-300/80 p-12 min-h-[700px] flex flex-col my-auto">
              <div
                ref={fullscreenEditorRef}
                contentEditable
                dangerouslySetInnerHTML={{ __html: value }}
                onInput={handleInput}
                data-placeholder={placeholder}
                className="flex-1 text-sm text-slate-800 focus:outline-none prose prose-slate max-w-none leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
              />
            </div>
          </div>

          {/* Fullscreen Footer */}
          <div className="bg-slate-900 px-6 py-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Full formatting supported: Bold, Italic, Underline, Headings, Lists, Quotes & Dividers</span>
            </div>
            <span>Press Esc or click "Save & Return" to finish</span>
          </div>
        </div>
      )}
    </div>
  );
}
