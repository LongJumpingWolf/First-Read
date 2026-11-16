import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Printer, 
  Trash2, 
  Highlighter, 
  Type, 
  Square, 
  BookOpen,
  User,
  Layout,
  Sun,
  Moon,
  HelpCircle,
  Settings,
  CircleCheck,
  Loader2,
  ChevronDown,
  X,
  MousePointer2,
  Undo2,
  Redo2,
  Minus
} from 'lucide-react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { AppState, Annotation, PageData } from './types';
import NoteEditor from './components/NoteEditor';
import PDFViewer from './components/PDFViewer';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const PASTEL_COLORS = [
  { name: 'Yellow', color: '#fef08a' },
  { name: 'Blue', color: '#bfdbfe' },
  { name: 'Green', color: '#bbf7d0' },
  { name: 'Pink', color: '#fbcfe8' },
];

const STORAGE_KEY = 'mednotes_app_state';

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          pdfUrl: null, // Blob URLs don't persist
          currentPage: parsed.currentPage || 1,
          zoom: parsed.zoom || 1.0,
          pages: parsed.pages || {},
          activeTool: 'select',
          highlightColor: parsed.highlightColor || PASTEL_COLORS[0].color,
          highlightOpacity: parsed.highlightOpacity || 0.6,
          underlineColor: parsed.underlineColor || '#FF3B30',
          underlineThickness: parsed.underlineThickness || 2,
          boxColor: parsed.boxColor || '#000000',
          boxThickness: parsed.boxThickness || 1.5,
          fixedHeightEnabled: parsed.fixedHeightEnabled ?? false,
          fixedHeightValue: parsed.fixedHeightValue ?? 20,
          colorPresets: parsed.colorPresets || [],
          history: { past: [], future: [] }
        };
      } catch (e) {
        console.error('Failed to parse saved state', e);
      }
    }
    return {
      fileName: null,
      pdfUrl: null,
      currentPage: 1,
      numPages: 0,
      zoom: 1.0,
      pages: {},
      activeTool: 'select',
      highlightColor: PASTEL_COLORS[0].color,
      highlightOpacity: 0.6,
      underlineColor: '#FF3B30',
      underlineThickness: 2,
      boxColor: '#000000',
      boxThickness: 1.5,
      fixedHeightEnabled: false,
      fixedHeightValue: 24,
      colorPresets: [],
      history: { past: [], future: [] }
    };
  });

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [isHighlighterSettingsOpen, setIsHighlighterSettingsOpen] = useState(false);
  const [isUnderlineSettingsOpen, setIsUnderlineSettingsOpen] = useState(false);
  const [isBoxSettingsOpen, setIsBoxSettingsOpen] = useState(false);

  const highlightSettingsRef = useRef<HTMLDivElement>(null);
  const underlineSettingsRef = useRef<HTMLDivElement>(null);
  const boxSettingsRef = useRef<HTMLDivElement>(null);

  // Click outside listener for settings
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (highlightSettingsRef.current && !highlightSettingsRef.current.contains(event.target as Node)) {
        setIsHighlighterSettingsOpen(false);
      }
      if (underlineSettingsRef.current && !underlineSettingsRef.current.contains(event.target as Node)) {
        setIsUnderlineSettingsOpen(false);
      }
      if (boxSettingsRef.current && !boxSettingsRef.current.contains(event.target as Node)) {
        setIsBoxSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Persistence effect
  useEffect(() => {
    const { pdfUrl, history, ...persistableState } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  }, [state]);

  const pushToHistory = (newPages: Record<number, PageData>) => {
    setState(prev => {
      const currentAnnotations: Record<number, Annotation[]> = {};
      Object.entries(prev.pages).forEach(([page, data]) => {
        currentAnnotations[Number(page)] = data.annotations;
      });

      return {
        ...prev,
        history: {
          past: [...prev.history.past.slice(-19), currentAnnotations],
          future: []
        },
        pages: newPages
      };
    });
  };

  const undo = () => {
    setState(prev => {
      if (prev.history.past.length === 0) return prev;
      const newPast = [...prev.history.past];
      const previousAnnotations = newPast.pop()!;
      
      const currentAnnotations: Record<number, Annotation[]> = {};
      Object.entries(prev.pages).forEach(([page, data]) => {
        currentAnnotations[Number(page)] = data.annotations;
      });

      const newPages = { ...prev.pages };
      // Apply historical annotations to all existing pages
      Object.keys(newPages).forEach(pageStr => {
        const page = Number(pageStr);
        newPages[page] = {
          ...newPages[page],
          annotations: previousAnnotations[page] || []
        };
      });

      return {
        ...prev,
        pages: newPages,
        history: {
          past: newPast,
          future: [currentAnnotations, ...prev.history.future]
        }
      };
    });
  };

  const redo = () => {
    setState(prev => {
      if (prev.history.future.length === 0) return prev;
      const newFuture = [...prev.history.future];
      const nextAnnotations = newFuture.shift()!;
      
      const currentAnnotations: Record<number, Annotation[]> = {};
      Object.entries(prev.pages).forEach(([page, data]) => {
        currentAnnotations[Number(page)] = data.annotations;
      });

      const newPages = { ...prev.pages };
      Object.keys(newPages).forEach(pageStr => {
        const page = Number(pageStr);
        newPages[page] = {
          ...newPages[page],
          annotations: nextAnnotations[page] || []
        };
      });

      return {
        ...prev,
        pages: newPages,
        history: {
          past: [...prev.history.past, currentAnnotations],
          future: newFuture
        }
      };
    });
  };

  // Keyboard shortcuts for annotations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isAlt = e.altKey;
      const isCtrl = e.ctrlKey || e.metaKey;
      
      // Don't trigger if typing in an editor or input, EXCEPT for undo/redo
      const target = e.target as HTMLElement;
      const isEditor = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      const isUndo = isCtrl && e.key.toLowerCase() === 'z';
      const isRedo = (isCtrl && e.key.toLowerCase() === 'y') || (isCtrl && e.shiftKey && e.key.toLowerCase() === 'z');

      if (isEditor && !isUndo && !isRedo) {
        return;
      }

      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.history, state.pages]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setState(prev => ({
        ...prev,
        fileName: file.name,
        pdfUrl: url,
        currentPage: prev.fileName === file.name ? prev.currentPage : 1,
        // Don't clear pages if it's the same file being re-uploaded
        pages: prev.fileName === file.name ? prev.pages : {},
      }));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  });

  const updatePageNotes = (page: number, side: 'left' | 'right', content: string) => {
    setState(prev => {
      const pageData = prev.pages[page] || { leftNotes: '', rightNotes: '', annotations: [] };
      return {
        ...prev,
        pages: {
          ...prev.pages,
          [page]: {
            ...pageData,
            [side === 'left' ? 'leftNotes' : 'rightNotes']: content
          }
        }
      };
    });
  };

  const addAnnotation = (ann: Omit<Annotation, 'id' | 'page'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const pageData = state.pages[state.currentPage] || { leftNotes: '', rightNotes: '', annotations: [] };
    
    // Add Tool specific properties
    const newAnn = { 
      ...ann, 
      id, 
      page: state.currentPage,
      opacity: ann.type === 'highlight' ? (ann.opacity ?? state.highlightOpacity) : undefined,
      color: ann.type === 'highlight' ? state.highlightColor : ann.type === 'underline' ? state.underlineColor : state.boxColor,
      thickness: ann.type === 'underline' ? state.underlineThickness : ann.type === 'box' ? state.boxThickness : undefined
    };

    // Anti-stacking: Remove annotations that heavily overlap with the new one
    const filteredAnnotations = pageData.annotations.filter(existing => {
      const isSameType = existing.type === ann.type;
      if (!isSameType) return true;

      const overlapX = Math.max(0, Math.min(existing.rect.left + existing.rect.width, ann.rect.left + ann.rect.width) - Math.max(existing.rect.left, ann.rect.left));
      const overlapY = Math.max(0, Math.min(existing.rect.top + existing.rect.height, ann.rect.top + ann.rect.height) - Math.max(existing.rect.top, ann.rect.top));
      const overlapArea = overlapX * overlapY;
      const existingArea = existing.rect.width * existing.rect.height;
      const newArea = ann.rect.width * ann.rect.height;
      
      // If either has 0 area (like a line), check if they are spatially very close
      if (existingArea < 0.0001 || newArea < 0.0001) {
        // For lines, check if the X-overlap is significant and they are at almost the same Y
        const horizontalOverlap = overlapX / Math.max(existing.rect.width, ann.rect.width);
        const yDistance = Math.abs(existing.rect.top - ann.rect.top);
        return !(horizontalOverlap > 0.8 && yDistance < 1);
      }
      
      return (overlapArea / existingArea) < 0.8;
    });

    const newPages = {
      ...state.pages,
      [state.currentPage]: {
        ...pageData,
        annotations: [...filteredAnnotations, newAnn]
      }
    };
    pushToHistory(newPages);
  };

  const saveColorPreset = () => {
    if (state.colorPresets.length >= 5) return;
    const newPreset = {
      id: Math.random().toString(36).substr(2, 9),
      color: state.highlightColor,
      opacity: state.highlightOpacity
    };
    setState(prev => ({
      ...prev,
      colorPresets: [...prev.colorPresets, newPreset]
    }));
  };

  const deleteColorPreset = (id: string) => {
    setState(prev => ({
      ...prev,
      colorPresets: prev.colorPresets.filter(p => p.id !== id)
    }));
  };

  const handleExport = async () => {
    if (!state.pdfUrl) return;
    setIsExporting(true);
    setExportProgress(0);

    try {
      const existingPdfBytes = await fetch(state.pdfUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const newPdf = await PDFDocument.create();
      const font = await newPdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await newPdf.embedFont(StandardFonts.HelveticaBold);
      const fontItalic = await newPdf.embedFont(StandardFonts.HelveticaOblique);
      const fontBoldItalic = await newPdf.embedFont(StandardFonts.HelveticaBoldOblique);

      const drawRichText = (page: any, html: string, xStart: number, yStart: number, maxWidth: number) => {
        const fontSize = 9;
        const lineHeight = 12;
        let curX = xStart;
        let curY = yStart;

        // Simple HTML to fragments parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const renderElement = (element: Node, bold: boolean, italic: boolean, underline: boolean, listType?: 'ul' | 'ol', listIndex?: number) => {
          if (element.nodeType === Node.TEXT_NODE) {
            const text = element.textContent || '';
            const words = text.split(/(\s+)/);
            
            const currentFont = (bold && italic) ? fontBoldItalic : bold ? fontBold : italic ? fontItalic : font;

            words.forEach(word => {
              if (word === '') return;
              
              const wordWidth = currentFont.widthOfTextAtSize(word, fontSize);
              
              if (curX + wordWidth > xStart + maxWidth && word.trim() !== '') {
                curX = xStart;
                curY -= lineHeight;
              }

              page.drawText(word, {
                x: curX,
                y: curY,
                size: fontSize,
                font: currentFont,
                color: rgb(0.2, 0.2, 0.2),
              });

              if (underline) {
                page.drawLine({
                  start: { x: curX, y: curY - 1 },
                  end: { x: curX + wordWidth, y: curY - 1 },
                  thickness: 0.5,
                  color: rgb(0.2, 0.2, 0.2),
                });
              }

              curX += wordWidth;
            });
          } else if (element.nodeType === Node.ELEMENT_NODE) {
            const el = element as HTMLElement;
            const tagName = el.tagName.toLowerCase();
            
            const blockTags = ['p', 'div', 'li', 'h1', 'h2', 'ul', 'ol', 'blockquote'];
            const isBlock = blockTags.includes(tagName);

            let nextBold = bold || tagName === 'strong' || tagName === 'b';
            let nextItalic = italic || tagName === 'em' || tagName === 'i';
            let nextUnderline = underline || tagName === 'u';

            let curListType = listType;
            if (tagName === 'ul') curListType = 'ul';
            if (tagName === 'ol') curListType = 'ol';

            if (isBlock) {
              if (curX !== xStart) {
                curX = xStart;
                curY -= lineHeight;
              }
              if (tagName === 'li') {
                const marker = listType === 'ol' ? `${(listIndex || 0) + 1}. ` : '• ';
                const markerWidth = fontBold.widthOfTextAtSize(marker, fontSize);
                page.drawText(marker, { x: xStart - markerWidth - 4, y: curY, size: fontSize, font: fontBold });
                curX = xStart;
              }
            } else if (tagName === 'br') {
              curX = xStart;
              curY -= lineHeight;
            }

            let liCounter = 0;
            el.childNodes.forEach(child => {
              let nextListIndex = listIndex;
              if (tagName === 'ul' || tagName === 'ol') {
                if (child.nodeName.toLowerCase() === 'li') {
                  nextListIndex = liCounter++;
                }
              }
              renderElement(child, nextBold, nextItalic, nextUnderline, curListType, nextListIndex);
            });
            
            // Only add a trailing break for content-bearing blocks like p, h1, etc.
            // ul and ol are containers, and li handles its own newline via the start of the next element.
            const needsTrailingBreak = isBlock && tagName !== 'ul' && tagName !== 'ol' && tagName !== 'li';
            if (needsTrailingBreak) {
              curX = xStart;
              // Add extra space for paragraph margin
              curY -= (tagName === 'p' || tagName === 'h1' || tagName === 'h2') ? (lineHeight * 1.5) : lineHeight;
            }
          }
        };

        doc.body.childNodes.forEach(child => renderElement(child, false, false, false));
      };

      const pages = pdfDoc.getPages();
      
      for (let i = 0; i < pages.length; i++) {
        setExportProgress(Math.round(((i + 1) / pages.length) * 100));
        
        const pageNum = i + 1;
        const pageData = state.pages[pageNum] || { leftNotes: '', rightNotes: '', annotations: [] };
        const originalPage = pages[i];
        const { width, height } = originalPage.getSize();

        // Target layout: [Notes (0.3w) | Page (w) | Notes (0.3w)]
        // Total width = 1.8w
        const newWidth = width * 1.8;
        const margin = width * 0.4;
        
        const newPage = newPdf.addPage([newWidth, height]);
        
        // Copy original page into center
        const [embeddedPage] = await newPdf.embedPages([pdfDoc.getPages()[i]]);
        newPage.drawPage(embeddedPage, {
          x: margin,
          y: 0,
          width: width,
          height: height,
        });

        // Draw vertical separators
        const separatorColor = rgb(0.85, 0.85, 0.85);
        newPage.drawLine({
          start: { x: margin, y: 0 },
          end: { x: margin, y: height },
          thickness: 1,
          color: separatorColor,
        });
        newPage.drawLine({
          start: { x: margin + width, y: 0 },
          end: { x: margin + width, y: height },
          thickness: 1,
          color: separatorColor,
        });

        // Draw Annotations on center page
        pageData.annotations.forEach(ann => {
          const rect = {
            x: margin + (ann.rect.left / 100) * width,
            y: height - ((ann.rect.top / 100) * height) - ((ann.rect.height / 100) * height),
            width: (ann.rect.width / 100) * width,
            height: (ann.rect.height / 100) * height,
          };

          // Helper to convert hex to rgb
          const hexToRgb = (hex: string) => {
            const h = hex.replace('#', '');
            const r = parseInt(h.substring(0, 2), 16) / 255;
            const g = parseInt(h.substring(2, 4), 16) / 255;
            const b = parseInt(h.substring(4, 6), 16) / 255;
            return rgb(r, g, b);
          };

          if (ann.type === 'highlight' && ann.color) {
            newPage.drawRectangle({
              ...rect,
              color: hexToRgb(ann.color),
              opacity: ann.opacity || 0.35,
            });
          } else if (ann.type === 'underline' && ann.color) {
            newPage.drawLine({
              start: { x: rect.x, y: rect.y + rect.height / 2 },
              end: { x: rect.x + rect.width, y: rect.y + rect.height / 2 },
              thickness: ann.thickness || 2,
              color: hexToRgb(ann.color),
              opacity: 0.8
            });
          } else if (ann.type === 'box' && ann.color) {
            newPage.drawRectangle({
              ...rect,
              borderColor: hexToRgb(ann.color),
              borderWidth: ann.thickness || 1.5,
              color: rgb(1,1,1),
              opacity: 0,
            });
          }
        });

        newPage.drawText('Left Notes', { x: 20, y: height - 20, size: 14, font: fontBold });
        drawRichText(newPage, pageData.leftNotes, 20, height - 40, margin - 40);

        newPage.drawText('Right Notes', { x: margin + width + 20, y: height - 20, size: 14, font: fontBold });
        drawRichText(newPage, pageData.rightNotes, margin + width + 20, height - 40, margin - 40);
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${state.fileName?.replace('.pdf', '')}_Revised.pdf`;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleNewBook = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      fileName: null,
      pdfUrl: null,
      currentPage: 1,
      numPages: 0,
      zoom: 1.0,
      pages: {},
      activeTool: 'select',
      highlightColor: PASTEL_COLORS[0].color,
      highlightOpacity: 0.6,
      underlineColor: '#FF3B30',
      underlineThickness: 2,
      boxColor: '#000000',
      boxThickness: 1.5,
      fixedHeightEnabled: false,
      fixedHeightValue: 24,
      colorPresets: [],
      history: { past: [], future: [] }
    });
    setIsNewBookModalOpen(false);
  };

  if (!state.pdfUrl) {
    return (
      <div className={cn("min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300", isDarkMode ? "bg-slate-950" : "bg-slate-50")}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn("w-full max-w-3xl rounded-3xl shadow-2xl p-10 text-center border", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100")}
        >
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border rotate-2 group-hover:rotate-0 transition-transform", isDarkMode ? "bg-blue-500/10 border-blue-500/20" : "bg-blue-50 border-blue-100")}>
            <div className="relative">
              <Highlighter className="text-blue-500 shadow-sm" size={32} />
              <Square className="text-amber-500 absolute -bottom-1 -right-1 opacity-50" size={16} />
            </div>
          </div>
          <h1 className={cn("text-5xl font-black mb-2 tracking-tight", isDarkMode ? "text-white" : "text-gray-900")}>
            First <span className="text-blue-600">Read</span>
          </h1>
          <p className={cn("text-base mb-6 max-w-lg mx-auto leading-relaxed", isDarkMode ? "text-gray-400" : "text-gray-500")}>
            The premium sidebar note-taking experience for deep textbook study. Optimized for printing, crafted for layout perfection.
          </p>
          
          <div 
            {...getRootProps()} 
            className={cn(
              "border-2 border-dashed rounded-3xl p-8 transition-all cursor-pointer group relative overflow-hidden",
              isDragActive 
                ? "border-blue-500 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.2)]" 
                : isDarkMode ? "border-slate-700 hover:border-blue-500 hover:bg-slate-800" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex items-center justify-center gap-10">
              <motion.div 
                whileHover={{ scale: 1.1 }}
                className={cn("w-16 h-16 rounded-2xl shadow-lg flex items-center justify-center shrink-0", isDarkMode ? "bg-blue-600 text-white" : "bg-blue-600 text-white")}
              >
                <Plus size={32} strokeWidth={3} />
              </motion.div>
              <div className="text-left">
                <p className={cn("text-xl font-black", isDarkMode ? "text-slate-200" : "text-slate-800")}>
                  {isDragActive ? "Drop PDF now" : "Import PDF Document"}
                </p>
                <p className={cn("text-xs font-medium", isDarkMode ? "text-slate-500" : "text-slate-400")}>
                  Select a textbook or slide deck to start.
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex items-center justify-center gap-12">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500"><Layout size={18} /></div>
              <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isDarkMode ? "text-slate-500" : "text-slate-400")}>Split-View</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500"><Square size={18} /></div>
              <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isDarkMode ? "text-slate-500" : "text-slate-400")}>Annots</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Printer size={18} /></div>
              <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isDarkMode ? "text-slate-500" : "text-slate-400")}>Print-Ready</span>
            </div>
          </div>
        </motion.div>
        
        <p className="mt-8 text-gray-500 text-sm font-medium">© 2024 First Read. Focus on one page at a time.</p>
        
        {/* Help/Settings floating buttons on landing page too? Maybe just theme toggle */}
        <div className="fixed bottom-6 right-6 flex gap-3">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-4 rounded-full shadow-lg border transition-all", isDarkMode ? "bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
          >
            {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
          </button>
        </div>
      </div>
    );
  }

  const currentPageData = state.pages[state.currentPage] || { leftNotes: '', rightNotes: '', annotations: [] };

  return (
    <div className={cn("h-[100dvh] min-h-0 w-full max-w-full flex flex-col font-sans overflow-hidden transition-colors", isDarkMode ? "bg-slate-950 text-slate-200 dark" : "bg-slate-50 text-gray-900")}>
      {/* Header */}
      <header 
        className={cn("min-h-16 h-auto border-b flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 sm:px-4 xl:px-6 py-2 z-[60] shrink-0", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-200")}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 rotate-3">
              <Highlighter className="text-white" size={20} />
            </div>
            <div className="flex flex-col">
              <span className={cn("text-base font-black leading-none tracking-tight", isDarkMode ? "text-white" : "text-gray-900")}>First Read</span>
              <span className={cn("text-[10px] font-bold uppercase tracking-[0.1em]", isDarkMode ? "text-blue-400" : "text-blue-600")}>Precision Study</span>
            </div>
          </div>
          
          <div className={cn("h-6 w-px mx-2", isDarkMode ? "bg-slate-800" : "bg-gray-200")} />
          
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border min-w-[200px]", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-100")}>
            <span className={cn("text-xs font-bold truncate max-w-[150px]", isDarkMode ? "text-slate-300" : "text-gray-600")}>
              {state.fileName}
            </span>
            <X size={14} className="text-gray-400 cursor-pointer hover:text-red-500" onClick={() => setIsNewBookModalOpen(true)} />
          </div>

          <div className={cn("flex items-center gap-1 ml-4 h-9 p-1 rounded-lg border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-100")}>
             <button 
              onClick={() => setState(s => ({ ...s, currentPage: Math.max(1, s.currentPage - 1) }))}
              className={cn("p-1 rounded transition-all", isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white hover:shadow-sm text-gray-500")}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-2 flex items-center gap-1.5 min-w-[60px] justify-center text-xs">
              <span className={cn("font-bold", isDarkMode ? "text-slate-200" : "text-gray-700")}>{state.currentPage}</span>
              <span className="opacity-30">/</span>
              <span className="opacity-40">{state.numPages}</span>
            </div>
            <button 
              onClick={() => setState(s => ({ ...s, currentPage: Math.min(s.numPages, s.currentPage + 1) }))}
              className={cn("p-1 rounded transition-all", isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-white hover:shadow-sm text-gray-500")}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
             <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={cn("p-2 rounded-lg transition-all", isDarkMode ? "text-yellow-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100")}
                title="Toggle Dark Mode"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button 
                onClick={() => setIsHelpOpen(true)}
                className={cn("p-2 rounded-lg transition-all", isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100")}
                title="Help & FAQ"
              >
                <HelpCircle size={20} />
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className={cn("p-2 rounded-lg transition-all", isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100")}
                title="Application Settings"
              >
                <Settings size={20} />
              </button>
          </div>

          <div className={cn("h-6 w-px", isDarkMode ? "bg-slate-800" : "bg-gray-200")} />

          <div className={cn("flex items-center gap-1 p-1 rounded-xl border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-100")}>
            <button 
              onClick={undo}
              disabled={state.history.past.length === 0}
              className={cn("p-1.5 rounded-lg transition-all disabled:opacity-20", isDarkMode ? "text-slate-300 hover:bg-slate-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={18} />
            </button>
            <button 
              onClick={redo}
              disabled={state.history.future.length === 0}
              className={cn("p-1.5 rounded-lg transition-all disabled:opacity-20", isDarkMode ? "text-slate-300 hover:bg-slate-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={18} />
            </button>
          </div>

          <div className={cn("h-6 w-px", isDarkMode ? "bg-slate-800" : "bg-gray-200")} />

          <div className={cn("flex items-center gap-1 p-1 rounded-xl border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-100")}>
            <button 
              onClick={() => setState(s => ({ ...s, activeTool: 'select' }))}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                state.activeTool === 'select' 
                  ? (isDarkMode ? "bg-slate-700 text-blue-400" : "bg-white shadow-sm text-blue-600") 
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              )}
              title="Select / Arrow Tool"
            >
              <MousePointer2 size={18} />
            </button>
            
            <div className={cn("w-px h-4 mx-1", isDarkMode ? "bg-slate-700" : "bg-gray-200")} />

            <div className="relative" ref={highlightSettingsRef}>
              <div className="flex items-center">
                <button 
                  onClick={() => setState(s => ({ ...s, activeTool: s.activeTool === 'highlight' ? 'select' : 'highlight' }))}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-l-lg text-sm font-semibold transition-all border-r",
                    state.activeTool === 'highlight' 
                      ? (isDarkMode ? "bg-slate-700 text-blue-400" : "bg-white shadow-sm text-blue-600")
                      : isDarkMode ? "text-slate-400 hover:bg-slate-700 border-slate-700" : "text-gray-500 hover:bg-gray-50 border-gray-100"
                  )}
                >
                  <Highlighter size={16} />
                  <span>Highlight</span>
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-200" 
                    style={{ backgroundColor: state.highlightColor, opacity: state.highlightOpacity }} 
                  />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHighlighterSettingsOpen(!isHighlighterSettingsOpen);
                  }}
                  className={cn(
                    "px-1.5 py-1.5 bg-transparent rounded-r-lg cursor-pointer flex items-center transition-colors",
                    isDarkMode ? "hover:bg-slate-700" : "hover:bg-gray-100",
                    isHighlighterSettingsOpen && (isDarkMode ? "bg-slate-700" : "bg-gray-100")
                  )}
                >
                  <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isHighlighterSettingsOpen && "rotate-180")} />
                </button>
              </div>

              {/* Highlighter Settings Popover */}
              <div 
                className={cn(
                  "absolute top-full left-0 mt-1 w-72 rounded-2xl shadow-2xl border p-4 transition-all z-50 pointer-events-auto cursor-default",
                  isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-100",
                  isHighlighterSettingsOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-2"
                )}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <div className="space-y-4">
                  <div>
                    <label className={cn("text-[10px] font-bold uppercase tracking-wider mb-2 block", isDarkMode ? "text-slate-500" : "text-gray-400")}>Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={state.highlightColor}
                        onChange={(e) => setState(s => ({ ...s, highlightColor: e.target.value }))}
                        className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer p-0 bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={state.highlightColor}
                        onChange={(e) => setState(s => ({ ...s, highlightColor: e.target.value }))}
                        className={cn("flex-1 rounded-lg px-2 py-1 text-xs font-mono border", isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-gray-50 border-gray-100 text-gray-700")}
                        placeholder="#HEX"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Opacity</label>
                      <span className="text-[10px] font-bold text-blue-600">{Math.round(state.highlightOpacity * 100)}%</span>
                    </div>
                    <input 
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={state.highlightOpacity}
                      onChange={(e) => setState(s => ({ ...s, highlightOpacity: parseFloat(e.target.value) }))}
                      className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fixed Height</label>
                        <button 
                          onClick={() => setState(s => ({ ...s, fixedHeightEnabled: !s.fixedHeightEnabled }))}
                          className={cn(
                            "w-8 h-4 rounded-full relative transition-colors",
                            state.fixedHeightEnabled ? "bg-blue-600" : "bg-gray-200"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                            state.fixedHeightEnabled ? "left-4.5" : "left-0.5"
                          )} />
                        </button>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600">{state.fixedHeightValue}px</span>
                    </div>
                    <div className="px-1">
                      <input 
                        type="range"
                        min="5"
                        max="60"
                        step="1"
                        disabled={!state.fixedHeightEnabled}
                        value={state.fixedHeightValue}
                        onChange={(e) => setState(s => ({ ...s, fixedHeightValue: parseInt(e.target.value) }))}
                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-30"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-50">
                    <div className="flex justify-between items-center mb-2">
                       <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Presets ({state.colorPresets.length}/5)</label>
                       <button 
                         onClick={saveColorPreset}
                         disabled={state.colorPresets.length >= 5}
                         className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-1 rounded transition-colors disabled:opacity-30"
                       >
                         Save Current
                       </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {state.colorPresets.map((p) => (
                        <div key={p.id} className="relative group/preset">
                          <button 
                            onClick={() => setState(s => ({ ...s, highlightColor: p.color, highlightOpacity: p.opacity }))}
                            className="w-8 h-8 rounded-lg border border-gray-200 transition-transform hover:scale-110 shadow-sm"
                            style={{ backgroundColor: p.color, opacity: p.opacity }}
                          />
                          <button 
                            onClick={() => deleteColorPreset(p.id)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/preset:opacity-100 transition-opacity z-10"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      {state.colorPresets.length === 0 && (
                        <div className="w-full py-3 border border-dashed border-gray-200 rounded-xl flex items-center justify-center">
                          <span className="text-[10px] text-gray-400 italic">No presets yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative" ref={underlineSettingsRef}>
              <div className="flex items-center">
                <button 
                  onClick={() => setState(s => ({ ...s, activeTool: s.activeTool === 'underline' ? 'select' : 'underline' }))}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-l-lg text-sm font-semibold transition-all border-r border-gray-100",
                    state.activeTool === 'underline' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <div className="flex flex-col items-center justify-center">
                    <Minus size={18} className="rotate-[-10deg]" />
                  </div>
                  <span>Line</span>
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsUnderlineSettingsOpen(!isUnderlineSettingsOpen);
                  }}
                  className={cn(
                    "px-1.5 py-1.5 bg-transparent hover:bg-gray-100 rounded-r-lg cursor-pointer flex items-center transition-colors",
                    isUnderlineSettingsOpen && "bg-gray-100"
                  )}
                >
                  <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isUnderlineSettingsOpen && "rotate-180")} />
                </button>
              </div>

              {/* Line Settings Popover */}
              <div 
                className={cn(
                  "absolute top-full left-0 mt-1 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 transition-all z-50 pointer-events-auto cursor-default",
                  isUnderlineSettingsOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-2"
                )}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Line Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={state.underlineColor}
                        onChange={(e) => setState(s => ({ ...s, underlineColor: e.target.value }))}
                        className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer p-0 bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={state.underlineColor}
                        onChange={(e) => setState(s => ({ ...s, underlineColor: e.target.value }))}
                        className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-mono"
                        placeholder="#HEX"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Thickness</label>
                      <span className="text-[10px] font-bold text-blue-600">{state.underlineThickness}px</span>
                    </div>
                    <div className="px-1">
                      <input 
                        type="range"
                        min="1"
                        max="8"
                        step="0.5"
                        value={state.underlineThickness}
                        onChange={(e) => setState(s => ({ ...s, underlineThickness: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative" ref={boxSettingsRef}>
              <div className="flex items-center">
                <button 
                  onClick={() => setState(s => ({ ...s, activeTool: s.activeTool === 'box' ? 'select' : 'box' }))}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-l-lg text-sm font-semibold transition-all border-r border-gray-100",
                    state.activeTool === 'box' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Square size={16} />
                  <span>Box</span>
                  <div 
                    className="w-3 h-3 rounded border" 
                    style={{ borderColor: state.boxColor }} 
                  />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBoxSettingsOpen(!isBoxSettingsOpen);
                  }}
                  className={cn(
                    "px-1.5 py-1.5 bg-transparent hover:bg-gray-100 rounded-r-lg cursor-pointer flex items-center transition-colors",
                    isBoxSettingsOpen && "bg-gray-100"
                  )}
                >
                  <ChevronDown size={14} className={cn("text-gray-400 transition-transform", isBoxSettingsOpen && "rotate-180")} />
                </button>
              </div>

              {/* Box Settings Popover */}
              <div 
                className={cn(
                  "absolute top-full right-0 mt-1 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 transition-all z-50 pointer-events-auto cursor-default",
                  isBoxSettingsOpen ? "opacity-100 visible translate-y-0" : "opacity-0 invisible translate-y-2"
                )}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Stroke Color</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={state.boxColor}
                        onChange={(e) => setState(s => ({ ...s, boxColor: e.target.value }))}
                        className="w-8 h-8 rounded-lg overflow-hidden border-none cursor-pointer p-0 bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={state.boxColor}
                        onChange={(e) => setState(s => ({ ...s, boxColor: e.target.value }))}
                        className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-xs font-mono"
                        placeholder="#HEX"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Stroke Weight</label>
                      <span className="text-[10px] font-bold text-blue-600">{state.boxThickness}px</span>
                    </div>
                    <div className="px-1">
                      <input 
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={state.boxThickness}
                        onChange={(e) => setState(s => ({ ...s, boxThickness: parseFloat(e.target.value) }))}
                        className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-px h-6 bg-gray-200 mx-1" />

          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-xl font-bold text-sm border border-gray-200 shadow-sm hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
            Print / Export
          </button>

          <button 
            onClick={() => setIsNewBookModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-gray-800 rounded-xl font-bold text-sm border border-gray-200 shadow-sm hover:bg-gray-50 transition-all"
          >
            <Trash2 size={16} />
            New Book
          </button>

          <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400">
            <User size={20} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 min-h-0 min-w-0 grid grid-cols-[minmax(220px,0.85fr)_minmax(320px,1.5fr)_minmax(220px,0.85fr)] 2xl:grid-cols-[minmax(300px,350px)_minmax(0,1fr)_minmax(300px,350px)] overflow-hidden p-1 gap-1">
        {/* Left Side Notes */}
        <section className="min-w-0 min-h-0 overflow-hidden">
          <NoteEditor 
            title="Left Notes"
            pageNumber={state.currentPage}
            content={currentPageData.leftNotes}
            onChange={(val) => updatePageNotes(state.currentPage, 'left', val)}
          />
        </section>

        {/* Center PDF Viewer */}
        <section className="flex-1 min-w-0">
          <PDFViewer 
            url={state.pdfUrl}
            currentPage={state.currentPage}
            zoom={state.zoom}
            onNumPages={(num) => setState(s => ({ ...s, numPages: num }))}
            annotations={currentPageData.annotations}
            onAddAnnotation={addAnnotation}
            activeTool={state.activeTool}
            highlightColor={state.highlightColor}
            highlightOpacity={state.highlightOpacity}
            underlineColor={state.underlineColor}
            underlineThickness={state.underlineThickness}
            boxColor={state.boxColor}
            boxThickness={state.boxThickness}
            fixedHeightEnabled={state.fixedHeightEnabled}
            fixedHeightValue={state.fixedHeightValue}
            isDrawingDisabled={isHighlighterSettingsOpen || isUnderlineSettingsOpen || isBoxSettingsOpen}
            onZoomChange={(z) => setState(s => ({ ...s, zoom: z }))}
          />
        </section>

        {/* Right Side Notes */}
        <section className="w-[300px] xl:w-[350px] shrink-0">
          <NoteEditor 
            title="Right Notes"
            pageNumber={state.currentPage}
            content={currentPageData.rightNotes}
            onChange={(val) => updatePageNotes(state.currentPage, 'right', val)}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className={cn("h-10 border-t flex items-center justify-between px-6 shrink-0", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-gray-100")}>
        <p className="text-[10px] font-medium text-gray-400">© 2024 First Read. Precision study tools.</p>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
             <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">System Cloud Sync Active</span>
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={cn("p-1.5 rounded transition-colors", isDarkMode ? "text-slate-500 hover:text-yellow-400 hover:bg-slate-800" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50")}><Moon size={14} /></button>
            <button onClick={() => setIsHelpOpen(true)} className={cn("p-1.5 rounded transition-colors", isDarkMode ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50")}><HelpCircle size={14} /></button>
            <button onClick={() => setIsSettingsOpen(true)} className={cn("p-1.5 rounded transition-colors", isDarkMode ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50")}><Settings size={14} /></button>
          </div>
        </div>
      </footer>

      {/* Export Progress Overlay */}
      <AnimatePresence>
        {isExporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full border border-gray-100 text-center">
              <Printer className="mx-auto mb-6 text-blue-600 animate-pulse" size={48} />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Generating PDF...</h2>
              <p className="text-gray-500 text-sm mb-8">Please wait while we prepare your revision sheet.</p>
              
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${exportProgress}%` }}
                  className="h-full bg-blue-600 rounded-full"
                />
              </div>
              <span className="text-xs font-bold text-blue-600">{exportProgress}%</span>

              <div className="mt-8 text-left space-y-3">
                {[
                  { label: 'Preparing pages', done: exportProgress > 10 },
                  { label: 'Applying annotations', done: exportProgress > 40 },
                  { label: 'Adding notes', done: exportProgress > 70 },
                  { label: 'Finalizing PDF', done: exportProgress === 100 },
                ].map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center",
                      step.done ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300"
                    )}>
                      {step.done ? <CircleCheck size={12} /> : <div className="w-1 h-1 rounded-full bg-current" />}
                    </div>
                    <span className={cn("text-xs font-medium", step.done ? "text-gray-900" : "text-gray-400")}>{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Book Confirmation Modal */}
      <AnimatePresence>
        {isNewBookModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full border border-gray-100"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500">
                  <Trash2 size={24} />
                </div>
                <button 
                  onClick={() => setIsNewBookModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                >
                  <X size={20} />
                </button>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">New Book?</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                Are you sure? This will delete all current notes and annotations forever. This action cannot be undone.
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsNewBookModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleNewBook}
                  className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-red-200"
                >
                  Delete All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setIsHelpOpen(false)}
          >
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={cn("w-full max-w-lg rounded-3xl shadow-2xl p-8 border relative overflow-hidden", isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-900")}
              onClick={e => e.stopPropagation()}
            >
               <div className="flex justify-between items-center mb-6 text-2xl font-black">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 text-base">
                    ?
                  </div>
                  <h2>Help Guide</h2>
                </div>
                <button onClick={() => setIsHelpOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1 pr-6 custom-scrollbar">
                <section>
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Core Workflow</h3>
                  <div className="grid gap-3">
                    <div className={cn("p-4 rounded-2xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                      <p className="text-xs leading-relaxed opacity-70">
                        First Read is built for deep study. Annotate your textbook in the center, and take bulleted side-notes on both sides.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Print Capacity</h3>
                  <div className="grid gap-3">
                    <div className={cn("p-4 rounded-2xl border flex gap-3", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200")}>
                      <Printer size={18} className="shrink-0 text-blue-500" />
                      <p className="text-xs leading-relaxed opacity-70">
                        Side notes are limited to 40 "capacity units" per page. This ensures everything fits perfectly on A4 paper when you print your revision sheets.
                      </p>
                    </div>
                  </div>
                </section>
                
                <section>
                  <h3 className="text-xs font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Shortcuts</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                      <span className="opacity-50">Undo Action</span>
                      <span className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Ctrl + Z</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider">
                      <span className="opacity-50">Next Page</span>
                      <span className="bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Right Arrow</span>
                    </div>
                  </div>
                </section>
              </div>

              <button 
                onClick={() => setIsHelpOpen(false)}
                className="w-full mt-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-500/30"
              >
                Start Studying
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setIsSettingsOpen(false)}
          >
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={cn("w-full max-w-lg rounded-3xl shadow-2xl p-8 border relative overflow-hidden", isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-100 text-slate-900")}
              onClick={e => e.stopPropagation()}
            >
               <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black italic">Preferences</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500"><Moon size={20} /></div>
                    <div>
                      <h4 className="font-bold text-sm">Visual Theme</h4>
                      <p className="text-[10px] opacity-50 uppercase tracking-widest font-black">Switch to Dark Mode</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className={cn("w-14 h-7 rounded-full flex items-center px-1 transition-colors", isDarkMode ? "bg-blue-600" : "bg-slate-300")}
                  >
                    <motion.div 
                      layout
                      className="w-5 h-5 bg-white rounded-full shadow-sm"
                      animate={{ x: isDarkMode ? 24 : 0 }}
                    />
                  </button>
                </div>
              </div>

              <div className="mt-12 flex gap-4">
                <button 
                  onClick={() => setIsNewBookModalOpen(true)}
                  className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-500/5 rounded-2xl transition-colors"
                >
                  Reset App
                </button>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
