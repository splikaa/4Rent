// Global ambient type declarations for 4Rent

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

declare module 'lucide-react';

declare module 'html-to-image' {
  export const toPng: (node: HTMLElement, options?: any) => Promise<string>;
}
