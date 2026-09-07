export type CoverContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export type StoredCover = {
  content: Buffer;
  contentType: CoverContentType;
};
