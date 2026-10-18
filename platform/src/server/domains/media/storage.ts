import 'server-only';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { serverEnv } from '@/config/env';

/**
 * Where processed images live.
 *
 * One interface, one production implementation. Tests replace it through
 * `useMediaStorageForTests`, which nothing outside the test suite calls: an
 * unconfigured deployment gets `null` and refuses uploads, it never falls
 * back to something that pretends to store them.
 */
export interface MediaStorage {
  readonly key: string;
  put(objectKey: string, body: Buffer, contentType: string): Promise<void>;
  /** The object's bytes, or null when it does not exist. */
  get(objectKey: string): Promise<Buffer | null>;
  delete(objectKey: string): Promise<void>;
  /**
   * Large files (the guide videos) read in byte ranges and written in parts, so
   * neither direction ever holds a whole video in memory. Optional: a store
   * without them simply cannot serve video.
   */
  stream?(objectKey: string, range?: ByteRange): Promise<StoredStream | null>;
  multipart?: MultipartWriter;
}

export type ByteRange = { start: number; end?: number };

export type StoredStream = {
  body: ReadableStream<Uint8Array> | null;
  /** Bytes in this response. */
  length: number;
  /** Bytes in the whole object. */
  size: number;
  /** The range actually returned, when one was asked for. */
  range: { start: number; end: number } | null;
  contentType: string | null;
};

export interface MultipartWriter {
  start(objectKey: string, contentType: string): Promise<string>;
  part(objectKey: string, uploadId: string, partNumber: number, body: Buffer): Promise<string>;
  complete(objectKey: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abort(objectKey: string, uploadId: string): Promise<void>;
}

export type MediaStorageAvailability =
  | { available: true; provider: string }
  | { available: false; provider: string; reason: string };

export function mediaStorageAvailability(): MediaStorageAvailability {
  const env = serverEnv();
  if (env.MEDIA_STORAGE_PROVIDER !== 's3') {
    return {
      available: false,
      provider: env.MEDIA_STORAGE_PROVIDER,
      reason: 'Set MEDIA_STORAGE_PROVIDER=s3 with the MEDIA_S3_* bucket credentials.',
    };
  }
  const missing = (
    [
      ['MEDIA_S3_ENDPOINT', env.MEDIA_S3_ENDPOINT],
      ['MEDIA_S3_BUCKET', env.MEDIA_S3_BUCKET],
      ['MEDIA_S3_ACCESS_KEY_ID', env.MEDIA_S3_ACCESS_KEY_ID],
      ['MEDIA_S3_SECRET_ACCESS_KEY', env.MEDIA_S3_SECRET_ACCESS_KEY],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    return { available: false, provider: 's3', reason: `Missing ${missing.join(', ')}.` };
  }
  return { available: true, provider: 's3' };
}

class S3MediaStorage implements MediaStorage {
  readonly key = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const env = serverEnv();
    this.bucket = env.MEDIA_S3_BUCKET!;
    this.client = new S3Client({
      endpoint: env.MEDIA_S3_ENDPOINT!,
      region: env.MEDIA_S3_REGION,
      forcePathStyle: env.MEDIA_S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.MEDIA_S3_ACCESS_KEY_ID!,
        secretAccessKey: env.MEDIA_S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async put(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: body, ContentType: contentType }),
    );
  }

  async get(objectKey: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      if (!response.Body) return null;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async stream(objectKey: string, range?: ByteRange): Promise<StoredStream | null> {
    try {
      if (!range) {
        const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
        const size = Number(head.ContentLength ?? 0);
        const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }));
        return { body: response.Body?.transformToWebStream() ?? null, length: size, size, range: null, contentType: head.ContentType ?? null };
      }
      const header = `bytes=${range.start}-${range.end ?? ''}`;
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: objectKey, Range: header }));
      // "bytes 0-1023/146515"
      const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.ContentRange ?? '');
      if (!match) return null;
      const [start, end, size] = [Number(match[1]), Number(match[2]), Number(match[3])];
      return { body: response.Body?.transformToWebStream() ?? null, length: end - start + 1, size, range: { start, end }, contentType: response.ContentType ?? null };
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) return null;
      throw error;
    }
  }

  readonly multipart: MultipartWriter = {
    start: async (objectKey, contentType) => {
      const response = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }));
      if (!response.UploadId) throw new Error('multipart upload not started');
      return response.UploadId;
    },
    part: async (objectKey, uploadId, partNumber, body) => {
      const response = await this.client.send(new UploadPartCommand({ Bucket: this.bucket, Key: objectKey, UploadId: uploadId, PartNumber: partNumber, Body: body }));
      if (!response.ETag) throw new Error('part not stored');
      return response.ETag;
    },
    complete: async (objectKey, uploadId, parts) => {
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: objectKey,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
        }),
      );
    },
    abort: async (objectKey, uploadId) => {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: objectKey, UploadId: uploadId }));
    },
  };
}

let instance: MediaStorage | null = null;
let override: MediaStorage | null = null;

/** The configured store, or null when uploads must be refused. */
export function mediaStorage(): MediaStorage | null {
  if (override) return override;
  if (!mediaStorageAvailability().available) return null;
  instance ??= new S3MediaStorage();
  return instance;
}

/** Test seam only. Production code never calls this. */
export function useMediaStorageForTests(storage: MediaStorage | null): void {
  override = storage;
}
