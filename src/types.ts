export interface Annotation {
  id: string;
  page: number;
  type: 'highlight' | 'underline' | 'box';
  color?: string;
  opacity?: number;
  thickness?: number;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface PageData {
  leftNotes: string;
  rightNotes: string;
  annotations: Annotation[];
}

export interface ColorPreset {
  id: string;
  color: string;
  opacity: number;
}

export interface AppState {
  fileName: string | null;
  pdfUrl: string | null;
  currentPage: number;
  numPages: number;
  zoom: number;
  pages: Record<number, PageData>;
  activeTool: 'select' | 'highlight' | 'underline'| 'box';
  highlightColor: string;
  highlightOpacity: number;
  underlineColor: string;
  underlineThickness: number;
  boxColor: string;
  boxThickness: number;
  fixedHeightEnabled: boolean;
  fixedHeightValue: number;
  colorPresets: ColorPreset[];
  history: {
    past: Record<number, Annotation[]>[];
    future: Record<number, Annotation[]>[];
  };
}
