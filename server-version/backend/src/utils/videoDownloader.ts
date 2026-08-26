/**
 * 视频下载工具
 * 支持从URL下载视频到本地服务器
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { pipeline, Transform } from 'stream';
import { promises as dns } from 'dns';
import http from 'http';
import https from 'https';

// ipaddr.js is already present transitively through proxy-addr. Keep address
// classification centralized and reject every non-unicast range.
const ipaddr = require('ipaddr.js') as {
  parse(address: string): {
    kind(): 'ipv4' | 'ipv6';
    range(): string;
    isIPv4MappedAddress?(): boolean;
    toIPv4Address?(): { range(): string };
  };
};

const streamPipeline = promisify(pipeline);

export interface DownloadOptions {
  maxFileSize?: number;        // 最大文件大小 (字节)
  timeout?: number;            // 下载超时 (毫秒)
  tempDir?: string;            // 临时目录
}

export interface DownloadResult {
  success: boolean;
  localPath?: string;          // 本地文件路径
  fileName?: string;           // 文件名
  fileSize?: number;           // 文件大小
  mimeType?: string;           // MIME类型
  duration?: number;           // 视频时长(秒)
  error?: string;              // 错误信息
}

const DEFAULT_OPTIONS: DownloadOptions = {
  maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
  timeout: 10 * 60 * 1000,              // 10分钟
  tempDir: process.env.TEMP_DIR || '/tmp/videos'
};

const MAX_REDIRECTS = 3;
type ResolvedAddress = { address: string; family: 4 | 6 };

const normalizeHostname = (hostname: string) => hostname.replace(/^\[|\]$/g, '');

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress?.()) {
      return parsed.toIPv4Address?.()?.range() === 'unicast';
    }
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await dns.lookup(normalizeHostname(hostname), {
    all: true,
    verbatim: true,
  });

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('视频链接解析到了非公网地址');
  }

  return addresses.map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));
}

/** Validate a user-supplied URL before it is persisted or queued. */
export async function validateRemoteUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('视频链接格式不正确');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 http:// 或 https:// 链接');
  }
  if (!parsed.hostname || parsed.username || parsed.password) {
    throw new Error('视频链接不允许包含凭据');
  }
  if (parsed.port && !((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443'))) {
    throw new Error('视频链接端口不受支持');
  }

  await resolvePublicAddresses(parsed.hostname);
  return parsed;
}

const createPinnedAgent = (parsed: URL, addresses: ResolvedAddress[]) => {
  const lookup = (_hostname: string, _options: unknown, callback: (error: Error | null, address?: string, family?: number) => void) => {
    const selected = addresses[0];
    callback(null, selected.address, selected.family);
  };
  const options = { keepAlive: false, lookup: lookup as any };

  return parsed.protocol === 'https:'
    ? { httpAgent: new http.Agent(options), httpsAgent: new https.Agent(options) }
    : { httpAgent: new http.Agent(options), httpsAgent: new https.Agent(options) };
};

async function requestWithSafeRedirects(rawUrl: string, timeout: number): Promise<{ response: any }> {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const parsed = await validateRemoteUrl(currentUrl);
    const addresses = await resolvePublicAddresses(parsed.hostname);
    const agents = createPinnedAgent(parsed, addresses);
    const response = await axios.get(currentUrl, {
      responseType: 'stream',
      timeout,
      maxRedirects: 0,
      proxy: false,
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { 'User-Agent': 'eduK12-video-fetcher/1.0' },
      ...agents,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      response.data?.destroy();
      if (!location) throw new Error('视频链接重定向缺少目标地址');
      if (redirectCount === MAX_REDIRECTS) throw new Error('视频链接重定向次数过多');
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    return { response };
  }

  throw new Error('视频链接重定向次数过多');
}

class ByteLimitTransform extends Transform {
  private bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new Error('视频文件超过大小限制'));
      return;
    }
    callback(null, chunk);
  }
}

/**
 * 从URL下载视频
 */
export async function downloadVideo(
  videoUrl: string, 
  options: DownloadOptions = {}
): Promise<DownloadResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // 确保临时目录存在
  if (!fs.existsSync(opts.tempDir!)) {
    fs.mkdirSync(opts.tempDir!, { recursive: true });
  }

  const fileName = `download_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
  const localPath = path.join(opts.tempDir!, fileName);

  try {
    const parsedUrl = new URL(videoUrl);
    console.log(`[下载] 开始下载视频: ${parsedUrl.hostname}`);

    const { response } = await requestWithSafeRedirects(videoUrl, opts.timeout!);
    const contentLength = parseInt(response.headers['content-length'] || '0', 10);
    const contentType = response.headers['content-type'] || 'video/mp4';

    if (contentLength > opts.maxFileSize!) {
      response.data?.destroy();
      return {
        success: false,
        error: `文件过大: ${(contentLength / 1024 / 1024).toFixed(2)}MB, 最大限制: ${(opts.maxFileSize! / 1024 / 1024).toFixed(2)}MB`
      };
    }

    // Chunked responses may omit Content-Length, so enforce the limit while
    // streaming as well to prevent unbounded disk consumption.
    const writer = fs.createWriteStream(localPath);
    await streamPipeline(response.data, new ByteLimitTransform(opts.maxFileSize!), writer);

    // 获取下载后的文件信息
    const stats = fs.statSync(localPath);
    
    console.log(`[下载] 完成: ${localPath}, 大小: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

    return {
      success: true,
      localPath,
      fileName,
      fileSize: stats.size,
      mimeType: contentType
    };

  } catch (error: any) {
    // 清理失败的文件
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }

    console.error('[下载] 失败:', error.message);
    
    return {
      success: false,
      error: `下载失败: ${error.message}`
    };
  }
}

/**
 * 清理临时文件
 */
export function cleanupTempFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[清理] 已删除临时文件: ${filePath}`);
    }
  } catch (error: any) {
    console.error(`[清理] 删除失败: ${filePath}`, error.message);
  }
}

/**
 * 视频验证结果
 */
export interface VideoValidationResult {
  valid: boolean;
  codec?: string;           // 视频编码格式 (h264, hevc, vp9, etc.)
  isH264?: boolean;         // 是否 H.264 编码
  width?: number;
  height?: number;
  is480pOrLower?: boolean;  // 是否 480p 或更低分辨率
  duration?: number;
  error?: string;
}

/**
 * 验证视频文件并获取编码信息
 */
export async function validateVideoFile(filePath: string): Promise<VideoValidationResult> {
  return new Promise((resolve) => {
    const ffmpeg = require('fluent-ffmpeg');

    ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
      if (err) {
        resolve({ valid: false, error: err.message });
        return;
      }

      const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
      if (!videoStream) {
        resolve({ valid: false, error: '不是有效的视频文件' });
        return;
      }

      const codec = videoStream.codec_name || 'unknown';
      const isH264 = ['h264', 'libx264'].includes(codec.toLowerCase());
      const height = videoStream.height || 0;
      const is480pOrLower = height <= 480;

      resolve({
        valid: true,
        codec,
        isH264,
        width: videoStream.width,
        height,
        is480pOrLower,
        duration: metadata.format?.duration
      });
    });
  });
}
