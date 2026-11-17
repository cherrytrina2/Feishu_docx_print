/// <reference types="vite/client" />

declare module 'docxtemplater-image-module-free' {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage(tagValue: unknown, tagName: string): unknown;
    getSize(img: unknown, tagValue: unknown, tagName: string): [number, number];
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}

declare module 'docx-preview' {
  export interface RenderOptions {
    className?: string;
    inWrapper?: boolean;
    ignoreWidth?: boolean;
    ignoreHeight?: boolean;
    experimental?: boolean;
    [key: string]: unknown;
  }
  export function renderAsync(
    data: Blob | ArrayBuffer,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement | null,
    options?: RenderOptions,
  ): Promise<unknown>;
}
