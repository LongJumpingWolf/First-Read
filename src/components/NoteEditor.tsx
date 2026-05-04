import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon, 
  List, 
  ListOrdered, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface NoteEditorProps {
  content: string;
  onChange: (content: string) => void;
  title: string;
  pageNumber: number;
}

const PAGE_CAPACITY = 40;
const BULLET_MULTIPLIER = 40 / 32;
const CHARS_PER_LINE = 45;
const CHARS_PER_BULLET_LINE = 40;

export default function NoteEditor({ content, onChange, title, pageNumber }: NoteEditorProps) {
  const [usage, setUsage] = useState({ score: 0, percent: 0 });

  const calculateUsage = (obj: any) => {
    let score = 0;
    const json = obj.getJSON ? obj.getJSON() : (obj.doc ? obj.doc.toJSON() : obj);
    
    const getTextLen = (node: any): number => {
      if (node.text) return node.text.length;
      if (!node.content) return 0;
      return node.content.reduce((acc: number, curr: any) => acc + getTextLen(curr), 0);
    };

    const visit = (nodes: any[]) => {
      if (!nodes) return;
      nodes.forEach(node => {
        if (node.type === 'listItem') {
          const textLen = getTextLen(node);
          const wrappedLines = Math.max(1, Math.ceil(textLen / CHARS_PER_BULLET_LINE));
          score += wrappedLines * BULLET_MULTIPLIER;
        } else if (node.type === 'paragraph' || node.type === 'heading') {
          const textLen = getTextLen(node);
          const multiplier = 1;
          const wrappedLines = Math.max(1, Math.ceil(textLen / CHARS_PER_LINE));
          score += wrappedLines * multiplier;
        } else if (node.content) {
          visit(node.content);
        }
      });
    };

    visit(json.content);
    return score;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      } as any),
      Underline,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      const score = calculateUsage(editor);
      setUsage({ score, percent: Math.min(100, (score / PAGE_CAPACITY) * 100) });
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none max-w-none min-h-[400px] text-gray-700',
      },
      handleKeyDown: (view, event) => {
        // Always allow navigation and deletion
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          return false;
        }

        // Allow Ctrl/Cmd combinations (Undo, Redo, Bold, etc.)
        if (event.ctrlKey || event.metaKey) {
          return false;
        }

        const score = calculateUsage(view.state);
        
        // Barrier: Block input if limit reached
        if (score >= PAGE_CAPACITY) {
          // If we're trying to add a new line or text
          if (event.key.length === 1 || event.key === 'Enter') {
            return true; // Block input
          }
        }

        if (event.key === 'Enter') {
          const { state } = view;
          const { selection } = state;
          const { $from, empty } = selection;

          if (empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
            // Check if we are inside a list item
            const listItem = $from.node(-1);
            if (listItem && (listItem.type.name === 'listItem')) {
              // We are on an empty list item
              if (view.dispatch) {
                // Manually trigger liftListItem since we're in handleKeyDown
                // Simplest is to let TipTap handle it if we return false, or use commands
              }
            }
          }
        }
        return false;
      },
    },
  });

  // Initial usage calculation
  useEffect(() => {
    if (editor && !usage.score) {
      const score = calculateUsage(editor);
      setUsage({ score, percent: Math.min(100, (score / PAGE_CAPACITY) * 100) });
    }
  }, [editor]);

  // Update content when page changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content, false as any);
      const score = calculateUsage(editor);
      setUsage({ score, percent: Math.min(100, (score / PAGE_CAPACITY) * 100) });
      try {
        editor.commands.setTextSelection({ from, to });
      } catch (e) {
        // Selection might be invalid after content change
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  const isLimitReached = usage.score >= PAGE_CAPACITY;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-2 h-6 rounded-full",
            title.includes('Left') ? "bg-amber-400" : "bg-emerald-400"
          )} />
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <span className="text-xs font-medium text-gray-400 bg-white px-2 py-1 rounded-md border border-gray-100">
          Page {pageNumber}
        </span>
      </div>

      {/* Usage Indicator */}
      <div className="bg-gray-50/50 px-4 py-2 border-b border-gray-100 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className={cn("transition-colors", isLimitReached ? "text-red-500" : "text-gray-400")}>
              Page Space Usage
            </span>
            {isLimitReached && (
              <span className="flex items-center gap-1 text-red-500 bg-red-50 px-1.5 rounded animate-pulse">
                <AlertTriangle size={10} /> Limit Reached
              </span>
            )}
          </div>
          <span className={cn(isLimitReached ? "text-red-600" : "text-blue-600")}>
            {Math.round(usage.percent)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={cn(
              "h-full transition-all duration-300 rounded-full",
              usage.percent < 70 ? "bg-blue-500" : 
              usage.percent < 90 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${usage.percent}%` }}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-gray-50 flex items-center gap-1 flex-wrap">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn("p-1.5 rounded hover:bg-gray-100", editor.isActive('bold') && "bg-gray-100 text-blue-600")}
        >
          <Bold size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn("p-1.5 rounded hover:bg-gray-100", editor.isActive('italic') && "bg-gray-100 text-blue-600")}
        >
          <Italic size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn("p-1.5 rounded hover:bg-gray-100", editor.isActive('underline') && "bg-gray-100 text-blue-600")}
        >
          <UnderlineIcon size={16} />
        </button>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={cn("p-1.5 rounded hover:bg-gray-100", editor.isActive('bulletList') && "bg-gray-100 text-blue-600")}
        >
          <List size={16} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn("p-1.5 rounded hover:bg-gray-100", editor.isActive('orderedList') && "bg-gray-100 text-blue-600")}
        >
          <ListOrdered size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
        <EditorContent editor={editor} />
        {isLimitReached && (
          <div className="absolute top-2 right-4 z-10">
            <div className="bg-red-50 border border-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded shadow-sm flex items-center gap-1">
              <AlertTriangle size={10} /> STOP: Note limit reached for this page
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-50 flex justify-between items-center bg-gray-50/30">
        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
          {Math.round(usage.score)} / {PAGE_CAPACITY} capacity units
        </span>
        <div className={cn(
          "flex items-center gap-1.5 font-medium transition-colors",
          isLimitReached ? "text-red-500" : "text-emerald-500"
        )}>
          {isLimitReached ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
          <span className="text-[10px] uppercase tracking-wider">
            {isLimitReached ? "Limit Reached" : "Saved"}
          </span>
        </div>
      </div>
    </div>
  );
}
