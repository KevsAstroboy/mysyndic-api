import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: Minio.Client;
  /** Client utilisé uniquement pour signer les URLs (endpoint joignable navigateur). */
  private presignClient: Minio.Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const useSSL = this.config.get<string>('MINIO_USE_SSL') === 'true';
    const port = parseInt(
      this.config.get('MINIO_INTERNAL_PORT') ||
        this.config.getOrThrow('MINIO_PORT'),
      10,
    );
    const accessKey = this.config.getOrThrow('MINIO_ACCESS_KEY');
    const secretKey = this.config.getOrThrow('MINIO_SECRET_KEY');
    this.client = new Minio.Client({
      endPoint: this.config.getOrThrow('MINIO_ENDPOINT'),
      port,
      accessKey,
      secretKey,
      useSSL,
    });

    // Les URLs pré-signées sont consommées par le navigateur : elles doivent
    // pointer vers un endpoint public (ex. localhost:9010), pas le hostname
    // interne Docker (minio:9000) injoignable depuis l'hôte. On fixe la région
    // pour éviter l'appel réseau `getBucketRegion` au moment de signer.
    const publicEndpoint =
      this.config.get<string>('MINIO_PUBLIC_ENDPOINT') ||
      this.config.getOrThrow('MINIO_ENDPOINT');
    const publicPort = parseInt(
      this.config.get<string>('MINIO_PUBLIC_PORT') || String(port),
      10,
    );
    const publicUseSSL =
      this.config.get<string>('MINIO_PUBLIC_USE_SSL') === undefined
        ? useSSL
        : this.config.get<string>('MINIO_PUBLIC_USE_SSL') === 'true';
    this.presignClient = new Minio.Client({
      endPoint: publicEndpoint,
      port: publicPort,
      accessKey,
      secretKey,
      useSSL: publicUseSSL,
      region: this.config.get<string>('MINIO_REGION') || 'us-east-1',
    });
  }

  async ensureBucket(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
    }
  }

  /**
   * Upload d'un flux (ex: fichier vidéo temporaire sur disque) sans charger
   * les octets en mémoire. `size` permet à MinIO d'utiliser un PUT en une passe.
   */
  async uploadStream(
    bucket: string,
    objectName: string,
    stream: NodeJS.ReadableStream,
    mimetype: string,
    size?: number,
  ): Promise<void> {
    await this.client.putObject(bucket, objectName, stream as never, size, {
      'Content-Type': mimetype,
    } as never);
  }

  async statObject(bucket: string, objectName: string) {
    return this.client.statObject(bucket, objectName);
  }

  async objectExists(bucket: string, objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lecture partielle (HTTP Range) pour la lecture/seek vidéo sans exposer MinIO.
   */
  async getPartialObject(
    bucket: string,
    objectName: string,
    offset: number,
    length: number,
  ) {
    return this.client.getPartialObject(bucket, objectName, offset, length);
  }

  async uploadFile(
    bucket: string,
    objectName: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    await this.client.putObject(bucket, objectName, buffer, undefined, {
      'Content-Type': mimetype,
    });

    const useSSL = this.config.get<string>('MINIO_USE_SSL') === 'true';
    const protocol = useSSL ? 'https' : 'http';
    const endpoint = this.config.getOrThrow('MINIO_ENDPOINT');
    const port = this.config.getOrThrow('MINIO_INTERNAL_PORT');

    return `${protocol}://${endpoint}:${port}/${bucket}/${objectName}`;
  }

  async uploadBase64(
    base64: string,
    bucket: string,
    objectName: string,
  ): Promise<string> {
    const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Format base64 invalide');
    }

    const mimetype = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    const maxSize = 5 * 1024 * 1024;
    if (buffer.length > maxSize) {
      throw new Error("L'image dépasse la taille maximale de 5 Mo");
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mimetype)) {
      throw new Error(`Format d'image non supporté : ${mimetype}`);
    }

    return this.uploadFile(bucket, objectName, buffer, mimetype);
  }

  async getPresignedUrl(
    bucket: string,
    objectName: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.presignClient.presignedGetObject(
      bucket,
      objectName,
      expirySeconds,
    );
  }

  async getObjectStream(bucket: string, objectName: string) {
    const stat = await this.client.statObject(bucket, objectName);
    const stream = await this.client.getObject(bucket, objectName);
    return {
      stream,
      size: stat.size,
      contentType: stat.metaData?.['content-type'],
    };
  }

  async deleteFile(bucket: string, objectName: string): Promise<void> {
    await this.client.removeObject(bucket, objectName);
  }
}
