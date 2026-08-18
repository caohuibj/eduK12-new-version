/**
 * 视频下载工具
 * 支持从URL下载视频到本地服务器
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

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
    console.log(`[下载] 开始下载视频: ${videoUrl}`);
    
    // 发送HEAD请求获取文件信息
    const headResponse = await axios.head(videoUrl, { timeout: 30000 });
    const contentLength = parseInt(headResponse.headers['content-length'] || '0');
    const contentType = headResponse.headers['content-type'] || 'video/mp4';
    
    if (contentLength > opts.maxFileSize!) {
      return {
        success: false,
        error: `文件过大: ${(contentLength / 1024 / 1024).toFixed(2)}MB, 最大限制: ${(opts.maxFileSize! / 1024 / 1024).toFixed(2)}MB`
      };
    }

    // 下载文件
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      timeout: opts.timeout,
      maxContentLength: opts.maxFileSize,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const writer = fs.createWriteStream(localPath);
    await streamPipeline(response.data, writer);

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
