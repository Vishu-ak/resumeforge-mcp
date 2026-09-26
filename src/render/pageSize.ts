export type PageSize = "letter" | "a4";

export const DOCX_PAGE_DIMENSIONS: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
};
