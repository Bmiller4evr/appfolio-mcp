// ABOUTME: Shared descriptor shape for both the Reports and Database API catalogs.
export interface Descriptor {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
}
