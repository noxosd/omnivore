import * as Minio from 'minio'
import * as crypto from 'node:crypto'
import { Bucket } from './bucket'
import { Readable } from 'stream';

export interface SaveOptions {
    contentType?: string;
    public?: boolean;
    timeout?: number
}

type Query = {
    [key: string]: string;
  };

export interface GetSignedUrlConfig {
    accessibleAt?: string | number | Date;
    action: 'read' | 'write' | 'delete' | 'resumable';
    cname?: string;
    contentMd5?: string;
    extensionHeaders?: string;
    promptSaveAs?: string;
    queryParams?: Query;

    version?: string,
    expires: string | number | Date;
    contentType?: string,


}

function convertToDictionary(obj: Minio.ItemBucketMetadata): [string, any][] {
    return Object.entries(obj);
  }

export type SaveData =  Buffer | string

export interface S3FileMeta {
    md5Hash?: string;
}

export class File {
    private minioClient: Minio.Client
    private bucket: Bucket
    private filePath: string
    public publicURL: string

    constructor(filePath: string, bucket: Bucket, minioClient: Minio.Client, baseURL: string) {
        this.minioClient = minioClient
        this.bucket = bucket
        this.filePath = filePath
        this.publicURL = baseURL + '/' + filePath
    }

    async save(data: SaveData, _options?: SaveOptions) {
        await this.bucket.create()
        let md5sum =  crypto.createHash('md5').update(data).digest('base64')
        await this.minioClient.putObject(this.bucket.name, this.filePath, data, data.length, {
            "content-md5": md5sum,
            "content-type": _options?.contentType
        })
    }

    async getMetadata(): Promise<[S3FileMeta]> {
        const objectInfo = await this.minioClient.statObject(this.bucket.name, this.filePath)
        // return convertToDictionary(objectInfo.metaData)
        return [{md5Hash: objectInfo.metaData["content-md5"]}]
    }

    publicUrl() {
        return this.publicURL
    }

    // get publicUrl() {
    //     return  + '/' + this.publicURL
    // }

    async exists(): Promise<[boolean]> {
        try {
            await this.getMetadata()
        } catch {
            return [false]
        }
        return [true]
    }


    // Helper function to convert accessibleAt to a timestamp
    convertToTimestamp(value: string | number | Date): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value).getTime();
    }
    return value.getTime();
  }

    async getSignedUrl(cfg: GetSignedUrlConfig, options?: any): Promise<string> {
        let url
        const expires = cfg.expires
        const expirySeconds = Math.floor((typeof expires === 'number' ? expires - Date.now() : new Date(expires).getTime() - Date.now()) / 1000);
        if(cfg.action == 'write') {
            return this.minioClient.presignedPutObject(this.bucket.name, this.filePath, expirySeconds)
        }
            return this.minioClient.presignedGetObject(this.bucket.name, this.filePath, expirySeconds)
    }

    async download(): Promise<[Buffer]> {
        const fileStream =await this.minioClient.getObject(this.bucket.name, this.filePath)
        return new Promise((resolve, reject) => {
            let chunks: Buffer[] = []

            fileStream.on("data", chunk => chunks.push(chunk));
            fileStream.on("end", () => {
                resolve([Buffer.concat(chunks)])
            });
            fileStream.on("error", err => reject(`error converting stream - ${err}`))
    })
    }
}