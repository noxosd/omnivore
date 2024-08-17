import * as Minio from 'minio'
import { Bucket } from './bucket'
export interface S3StorageOptions {
    keyFilename: string
}

const minioHost = 'minio'
const minioPort = 9000
const minioAccessKey = process.env.MINIO_ACCESS_KEY
const minioSecretKey = process.env.MINIO_SECRET_KEY

export class Storage{
    private minioClient
    private useSSL = false
    private host = minioHost
    private port = minioPort
    constructor(options?: S3StorageOptions) {
        if (minioAccessKey == undefined || minioSecretKey == undefined) {
            console.log("Access key or secret key is undefined")
        }
         this.minioClient = new Minio.Client({
            endPoint: this.host,
            port: this.port,
            useSSL: this.useSSL,
            accessKey: minioAccessKey || "",
            secretKey: minioSecretKey || "", 
          })
    }

    get url() {
        return (this.useSSL ? "https://" : "http://")
        + this.host + ":"
        + this.port
    }

    bucket(name: string) {
        return new Bucket(name, this.minioClient, this.url)
    }
}