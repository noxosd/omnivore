import * as Minio from 'minio'
import { File } from './file'

export interface S3FileOptions {

}

export interface GetFilesOptions {
    autoPaginate?: boolean;
    delimiter?: string;
    includeTrailingDelimiter?: boolean;
    matchGlob?: string;
    maxApiCalls?: number;
    maxResults?: number;
    pageToken?: string;
    prefix?: string;
    startOffset?: string;
    userProject?: string;
    versions?: boolean;
}

export type GetFilesResponse = [
    File[],
    unknown
];


export class Bucket {
    private minioClient: Minio.Client
    public name: string
    public baseURL

    constructor(name: string,  minioClient: Minio.Client, baseURL: string) {
        this.name = name
        this.minioClient = minioClient
        this.baseURL = baseURL
    }

    file(name: string, _options? :S3FileOptions) {
        return new File(name, this, this.minioClient, this.baseURL + '/' + this.name)
    }

    async create() {
        let exists = await this.minioClient.bucketExists(this.name)
        if (exists) {
            console.log('Bucket ' + this.name + ' exists.') //change to logger from utils?
        } else {
            await this.minioClient.makeBucket(this.name)
            console.log('Bucket ' + this.name + ' created.')
        }
    }

    async getFiles(options?: GetFilesOptions): Promise<GetFilesResponse> {
        const files = []
        const stream = await this.minioClient.listObjects(this.name, options?.prefix)
        return new Promise((resolve, reject) => {
            const files: File[] = [];
            stream.on('data', (f) => {
                if (!f.name) return
                const file = new File(f.name || "", this, this.minioClient, this.baseURL + '/' + this.name )
            });
            stream.on('end', () => {
                resolve([
                    files,
                    undefined
                ])
            });
            stream.on('error', function (err) {
                reject(err)
            });
        });
    }
}