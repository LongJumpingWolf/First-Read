import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjs from 'pdfjs-dist';
// Import worker from local node_modules
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
// Import text layer styles (need to find where they are or define them)
import { Annotation } from '../types';
import { cn } from '../lib/utils';
import { ZoomIn, ZoomOut, Maximize2, Search, X } from 'lucide-react';

// Set up worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PDFViewerProps {
  url: string;
  currentPage: number;
  zoom: number;
  onNumPages: (num: number) => void;
  annotations: Annotation[];
  onAddAnnotation: (ann: Omit<Annotation, 'id' | 'page'>) => void;
  activeTool: 'select' | 'highlight' | 'underline' | 'box';
  highlightColor: string;
  highlightOpacity: number;
  underlineColor: string;
  underlineThickness: number;
  boxColor: string;
  boxThickness: number;
  fixedHeightEnabled: boolean;
  fixedHeightValue: number;
  onZoomChange: (zoom: number) => void;
  isDrawingDisabled?: boolean;
}

export default function PDFViewer({
  url,
  currentPage,
  zoom,
  onNumPages,
  annotations,
  onAddAnnotation,
  activeTool,
  highlightColor,
  highlightOpacity,
  underlineColor,
  underlineThickness,
  boxColor,
  boxThickness,
  fixedHeightEnabled,
  fixedHeightValue,
  onZoomChange,
  isDrawingDisabled
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        const loadingTask = pdfjs.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        onNumPages(pdfDoc.numPages);
      } catch (err) {
        console.error('Error loading PDF:', err);
      }
    };
    loadPdf();
  }, [url]);

  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  const renderPage = async () => {
    if (!pdf || !canvasRef.current || !overlayRef.current || !textLayerRef.current) return;

    // Cancel any existing render tasks
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const page = await pdf.getPage(currentPage);
    const dpr = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: zoom });
    
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    context.scale(dpr, dpr);

    overlayRef.current.style.width = `${viewport.width}px`;
    overlayRef.current.style.height = `${viewport.height}px`;
    textLayerRef.current.style.width = `${viewport.width}px`;
    textLayerRef.current.style.height = `${viewport.height}px`;

    const renderTask = page.render({ 
      canvasContext: context, 
      viewport: viewport,
      // @ts-ignore
      canvas: canvasRef.current! 
    });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
    } catch (err: any) {
      if (err.name !== 'RenderingCancelledException') {
        console.error('Render error:', err);
      }
      return;
    }

    // Render Text Layer and Extract Glyphs
    try {
      const textContent = await page.getTextContent();
      textLayerRef.current.innerHTML = '';
      
      const TextLayerClass = (pdfjs as any).TextLayer;
      if (TextLayerClass) {
        const textLayer = new TextLayerClass({
          textContentSource: textContent,
          container: textLayerRef.current,
          viewport: viewport,
        });
        await textLayer.render();
      }
    } catch (err) {
      console.error('Text layer render error:', err);
    }
  };

  useEffect(() => {
    renderPage();
  }, [pdf, currentPage, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'select') return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setDragStart({ x, y });
    setDragCurrent({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || activeTool === 'select' || !dragStart) return;

    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragCurrent({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !dragStart || !dragCurrent) {
      setIsDrawing(false);
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const overlayRect = overlayRef.current?.getBoundingClientRect();
    if (overlayRect) {
      let left = Math.min(dragStart.x, dragCurrent.x);
      let top = Math.min(dragStart.y, dragCurrent.y);
      let width = Math.abs(dragStart.x - dragCurrent.x);
      let height = Math.abs(dragStart.y - dragCurrent.y);

      if (fixedHeightEnabled && activeTool === 'highlight') {
        height = fixedHeightValue || 24;
        top = dragStart.y - (height / 2);
      }

      if (activeTool === 'underline') {
        height = underlineThickness || 2;
        top = dragStart.y - (height / 2);
      }

      if (width > 2 && (height > 1 || activeTool === 'underline')) {
        onAddAnnotation({
          type: activeTool === 'highlight' ? 'highlight' : activeTool === 'underline' ? 'underline' : 'box',
          color: activeTool === 'highlight' ? highlightColor : activeTool === 'underline' ? underlineColor : boxColor,
          opacity: activeTool === 'highlight' ? highlightOpacity : undefined,
          thickness: activeTool === 'underline' ? underlineThickness : activeTool === 'box' ? boxThickness : undefined,
          rect: {
            left: (left / overlayRect.width) * 100,
            top: (top / overlayRect.height) * 100,
            width: (width / overlayRect.width) * 100,
            height: (height / overlayRect.height) * 100,
          },
        });
      }
    }

    setIsDrawing(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  const getActiveSelectionRect = () => {
    if (!isDrawing || !dragStart || !dragCurrent) return null;
    
    let left = Math.min(dragStart.x, dragCurrent.x);
    let top = Math.min(dragStart.y, dragCurrent.y);
    let width = Math.abs(dragStart.x - dragCurrent.x);
    let height = Math.abs(dragStart.y - dragCurrent.y);

    if (activeTool === 'highlight' && fixedHeightEnabled) {
      height = fixedHeightValue || 24;
      top = dragStart.y - (height / 2);
    } else if (activeTool === 'underline') {
      height = underlineThickness || 2;
      top = dragStart.y - (height / 2);
    }

    if (width < 2 && height < 1) return null;

    return { left, top, width, height };
  };

  // Fullscreen logic
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleFullScreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => setIsFullScreen(true));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const fitToWidth = async () => {
    if (!pdf || !containerRef.current) return;
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1 });
    const containerWidth = containerRef.current.clientWidth - 48;
    onZoomChange(containerWidth / viewport.width);
  };

  useEffect(() => {
    if (pdf) fitToWidth();
  }, [pdf]);

  return (
    <div 
      className={cn(
        "flex flex-col h-full bg-slate-100 rounded-xl overflow-hidden shadow-inner border border-gray-200 transition-all",
        isFullScreen && "fixed inset-0 z-[100] rounded-none border-none"
      )}
      ref={containerRef}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
          <button 
            onClick={() => onZoomChange(Math.max(0.2, zoom - 0.2))}
            className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs font-semibold w-12 text-center text-gray-600">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => onZoomChange(Math.min(5, zoom + 0.2))}
            className="p-1.5 hover:bg-white hover:shadow-sm rounded-md transition-all text-gray-500"
          >
            <ZoomIn size={16} />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button 
            onClick={fitToWidth}
            className="px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-blue-500 hover:bg-white rounded transition-all uppercase tracking-wider"
          >
            Fit Width
          </button>
        </div>

        {showSearch ? (
          <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 flex-1 max-w-xs mx-4">
            <Search size={14} className="text-gray-400" />
            <input 
              autoFocus
              type="text" 
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm text-gray-600 w-full"
            />
            <button onClick={() => setShowSearch(false)}><X size={14} className="text-gray-400" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded">
              Active Tool: {activeTool}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(true)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Search size={18} /></button>
          <button onClick={toggleFullScreen} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><Maximize2 size={18} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 flex justify-center custom-scrollbar">
        <div className="relative shadow-2xl bg-white h-fit">
          <canvas ref={canvasRef} className="block" />
          
          <div 
            ref={textLayerRef} 
            className="pdf-text-layer absolute inset-0 z-30 pointer-events-none"
          />

          <div
            ref={overlayRef}
            className={cn(
              "absolute inset-0 z-40 pointer-events-none",
              (activeTool !== 'select' && !isDrawingDisabled) && "pointer-events-auto cursor-crosshair"
            )}
            style={{
              cursor: (activeTool === 'select' || isDrawingDisabled) ? 'default' : 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {annotations.map((ann) => (
              <div
                key={ann.id}
                className="absolute"
                style={{
                  left: `${ann.rect.left}%`,
                  top: `${ann.rect.top}%`,
                  width: `${ann.rect.width}%`,
                  height: ann.type === 'underline' ? `${ann.thickness || 2}px` : `${ann.rect.height}%`,
                  backgroundColor: (ann.type === 'highlight' || ann.type === 'underline') ? ann.color : 'transparent',
                  border: ann.type === 'box' ? `${ann.thickness || 1.5}px solid ${ann.color || '#000000'}` : 'none',
                  mixBlendMode: ann.type === 'highlight' ? 'multiply' : 'normal',
                  opacity: ann.type === 'highlight' ? (ann.opacity ?? 0.55) : 1,
                  borderRadius: ann.type === 'box' ? '2px' : '0'
                }}
              />
            ))}

            {isDrawing && getActiveSelectionRect() && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: getActiveSelectionRect()?.left,
                  top: getActiveSelectionRect()?.top,
                  width: getActiveSelectionRect()?.width,
                  height: activeTool === 'underline' ? '2px' : getActiveSelectionRect()?.height,
                  backgroundColor: activeTool === 'highlight' ? highlightColor : 'transparent',
                  mixBlendMode: activeTool === 'highlight' ? 'multiply' : 'normal',
                  opacity: activeTool === 'highlight' ? highlightOpacity : 1,
                  borderBottom: activeTool === 'underline' ? `${underlineThickness}px solid ${underlineColor}` : 'none',
                  border: activeTool === 'box' ? `${boxThickness}px solid ${boxColor}` : 'none',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
