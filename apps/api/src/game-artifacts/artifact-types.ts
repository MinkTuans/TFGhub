export type ArtifactFile = {
  path: string;
  content: string | Uint8Array;
  contentType: string;
};

/** A validated upload entry held on disk until atomic artifact publication. */
export type StagedArtifactFile = {
  path: string;
  sourcePath: string;
  contentType: string;
};

export type ArtifactInstallFile = ArtifactFile | StagedArtifactFile;

export type StoredArtifactFile = {
  path: string;
  content: Buffer;
  contentType: string;
};

export function serializeProject(project: unknown): string {
  return JSON.stringify(project).replaceAll('<', '\\u003c');
}
