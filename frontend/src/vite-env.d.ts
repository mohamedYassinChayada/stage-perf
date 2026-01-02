/// <reference types="vite/client" />

// TinyMCE type definitions - declared globally for use across the app
declare global {
  interface TinyMCEEvent {
    key?: string;
    inputType?: string;
    shiftKey?: boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  }

  interface TinyMCEButtonAPI {
    setText: (text: string) => void;
    setEnabled: (enabled: boolean) => void;
    isEnabled: () => boolean;
    setActive: (active: boolean) => void;
    isActive: () => boolean;
  }

  interface TinyMCESelection {
    getNode: () => Node | null;
    getRng: () => Range;
    setRng: (range: Range) => void;
    setCursorLocation: (node: Node, offset: number) => void;
    getContent: () => string;
    setContent: (content: string) => void;
    select: (node: Node, content?: boolean) => void;
    collapse: (toStart?: boolean) => void;
  }

  interface TinyMCEButtonConfig {
    text?: string;
    icon?: string;
    tooltip?: string;
    onAction?: () => void;
    onSetup?: (api: TinyMCEButtonAPI) => (() => void) | void;
  }

  interface TinyMCEUI {
    registry: {
      addButton: (name: string, config: TinyMCEButtonConfig) => void;
      addMenuItem: (name: string, config: object) => void;
      addToggleButton: (name: string, config: object) => void;
    };
  }

  interface TinyMCEEditor {
    id: string;
    selection: TinyMCESelection;
    ui: TinyMCEUI;
    initialized?: boolean;
    
    getContent: (args?: { format?: string }) => string;
    setContent: (content: string, args?: object) => void;
    getBody: () => HTMLElement;
    getDoc: () => Document;
    getContainer: () => HTMLElement;
    
    focus: () => void;
    remove: () => void;
    
    on: (event: string, callback: (e?: TinyMCEEvent) => void) => void;
    off: (event: string, callback: (e?: TinyMCEEvent) => void) => void;
    fire: (event: string, args?: object) => void;
    
    execCommand: (command: string, ui?: boolean, value?: string | boolean | unknown) => boolean;
    addCommand: (name: string, callback: () => void) => void;
    
    insertContent: (content: string) => void;
    
    // Custom property for reflow
    __reflowDocument?: (reason: string, caretMarkerId?: string | null) => void;
  }

  interface TinyMCEStatic {
    init: (config: object) => Promise<TinyMCEEditor[]>;
    get: (id: string) => TinyMCEEditor | null;
    remove: (selector?: string) => void;
  }

  interface Window {
    tinymce: TinyMCEStatic;
    insertPageBreak: () => void;
    qrScanFrameCount?: number;
  }
}

export {};
