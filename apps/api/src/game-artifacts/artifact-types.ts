export type ArtifactFile = {
  path: string;
  content: string | Uint8Array;
  contentType: string;
};

export type StoredArtifactFile = {
  path: string;
  content: Buffer;
  contentType: string;
};

export function serializeProject(project: unknown): string {
  return JSON.stringify(project).replaceAll('<', '\\u003c');
}
