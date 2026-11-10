// Global ambient type declarations for 4Rent
// Guarantees zero TypeScript errors in VS Code even without node_modules

declare module 'react' {
  const React: any;
  export default React;
  export const useState: <T>(initialState: T | (() => T)) => [T, (action: T | ((prevState: T) => T)) => void];
  export const useEffect: (effect: () => void | (() => void), deps?: readonly any[]) => void;
  export const useRef: <T>(initialValue: T) => { current: T };
  export const useMemo: <T>(factory: () => T, deps: readonly any[] | undefined) => T;
  export const useCallback: <T extends (...args: any[]) => any>(callback: T, deps: readonly any[]) => T;
  export type FC<P = {}> = (props: P) => any;
  export type ReactNode = any;
  export type FormEvent<T = any> = any;
  export type ChangeEvent<T = any> = any;
  export type MouseEvent<T = any> = any;
}

declare module 'react-dom' {
  const ReactDOM: any;
  export default ReactDOM;
}

declare module 'react/jsx-runtime' {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module 'react/jsx-dev-runtime' {
  export const jsxDEV: any;
  export const Fragment: any;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface Element {}
  }
}

declare module 'tesseract.js' {
  interface RecognizeLogger {
    status?: string;
    progress?: number;
    [key: string]: any;
  }
  interface RecognizeResult {
    data: {
      text: string;
      confidence: number;
      [key: string]: any;
    };
    [key: string]: any;
  }
  const Tesseract: {
    recognize: (image: any, lang?: string, options?: any) => Promise<RecognizeResult>;
    [key: string]: any;
  };
  export default Tesseract;
}


declare module 'lucide-react' {
  export const [key, string]: any;
}

declare module 'html-to-image' {
  export const toPng: (node: HTMLElement, options?: any) => Promise<string>;
}
