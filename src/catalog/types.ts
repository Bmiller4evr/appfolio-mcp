// ABOUTME: Shared descriptor shape used across both the Reports and Database API catalogs.
// ABOUTME: Defines the common interface that all catalog items must implement.
export interface Descriptor {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
}
