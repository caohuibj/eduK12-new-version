declare module 'cos-nodejs-sdk-v5' {
  interface COSOptions {
    SecretId?: string
    SecretKey?: string
    getAuthorization?: (options: any, callback: (data: any) => void) => void
  }

  interface PutObjectOptions {
    Bucket: string
    Region: string
    Key: string
    FilePath?: string
    Body?: Buffer | string
    onProgress?: (progressData: any) => void
  }

  interface DeleteObjectOptions {
    Bucket: string
    Region: string
    Key: string
  }

  interface GetTempKeysOptions {
    SecretId?: string
    SecretKey?: string
    DurationSeconds?: number
    Policy?: any
  }

  interface TempKeysResult {
    credentials: {
      tmpSecretId: string
      tmpSecretKey: string
      sessionToken: string
    }
    expiredTime: number
    startTime: number
  }

  class COS {
    constructor(options: COSOptions)
    putObject(options: PutObjectOptions, callback: (err: any, data: any) => void): void
    deleteObject(options: DeleteObjectOptions, callback: (err: any) => void): void
    getTempKeys(options: GetTempKeysOptions, callback: (err: any, data: TempKeysResult) => void): void
    getAuthorization(options: any, callback: (data: any) => void): void
  }

  export = COS
}
