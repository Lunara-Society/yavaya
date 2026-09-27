import 'server-only';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
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
