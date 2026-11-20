import type { ByteRange, MediaStorage, StoredStream, UnsatisfiableRange } from '@/server/domains/media/storage';

/**
 * A media bucket in memory, for tests that store and read real files: whole
 * objects, byte ranges, and multipart uploads with their parts and receipts,
 * the way the S3-compatible bucket behaves.
 */
export class MemoryStorage implements MediaStorage {
  readonly key = 'memory';
  readonly objects = new Map<string, { body: Buffer; type: string }>();
  private readonly uploads = new Map<string, { key: string; type: string; parts: Map<number, Buffer> }>();
  private counter = 0;

  async put(objectKey: string, body: Buffer, contentType: string) {
    this.objects.set(objectKey, { body: Buffer.from(body), type: contentType });
  }

  async get(objectKey: string) {
    return this.objects.get(objectKey)?.body ?? null;
  }

  async delete(objectKey: string) {
    this.objects.delete(objectKey);
  }

  async stream(objectKey: string, range?: ByteRange): Promise<StoredStream | UnsatisfiableRange | null> {
    const object = this.objects.get(objectKey);
    if (!object) return null;
    const size = object.body.length;
    if (range && range.start >= size) return { unsatisfiable: true, size };
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const slice = object.body.subarray(start, end + 1);
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(slice));
          controller.close();
        },
      }),
      length: slice.length,
      size,
      range: range ? { start, end } : null,
      contentType: object.type,
    };
  }

  readonly multipart = {
    start: async (objectKey: string, contentType: string) => {
      const id = `upload-${++this.counter}`;
      this.uploads.set(id, { key: objectKey, type: contentType, parts: new Map() });
      return id;
    },
    part: async (objectKey: string, uploadId: string, partNumber: number, body: Buffer) => {
      const upload = this.uploads.get(uploadId);
      if (!upload || upload.key !== objectKey) throw new Error('NoSuchUpload');
      upload.parts.set(partNumber, Buffer.from(body));
      return `"etag-${partNumber}-${body.length}"`;
    },
    complete: async (objectKey: string, uploadId: string, parts: { partNumber: number; etag: string }[]) => {
      const upload = this.uploads.get(uploadId);
      if (!upload || upload.key !== objectKey) throw new Error('NoSuchUpload');
      const body = Buffer.concat(parts.map((part) => upload.parts.get(part.partNumber)!));
      this.objects.set(objectKey, { body, type: upload.type });
      this.uploads.delete(uploadId);
    },
    abort: async (_objectKey: string, uploadId: string) => {
      this.uploads.delete(uploadId);
    },
  };

  get openUploads(): number {
    return this.uploads.size;
  }
}
