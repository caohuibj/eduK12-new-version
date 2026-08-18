/**
 * 中文分词服务（单例模式）
 * 使用 @node-rs/jieba 进行中文分词
 */

import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';
import { logger } from '../utils/logger';

/**
 * 分词服务类（单例模式）
 */
class WordSegmentationService {
  private static instance: WordSegmentationService;
  private jieba: any = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // 私有构造函数，防止外部实例化
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): WordSegmentationService {
    if (!WordSegmentationService.instance) {
      WordSegmentationService.instance = new WordSegmentationService();
    }
    return WordSegmentationService.instance;
  }

  /**
   * 初始化分词器
   */
  private async init(): Promise<void> {
    // 如果已经初始化，直接返回
    if (this.isInitialized && this.jieba) {
      return;
    }

    // 如果正在初始化，等待初始化完成
    if (this.initPromise) {
      return this.initPromise;
    }

    // 开始初始化
    this.initPromise = this.doInit();
    
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * 执行初始化
   */
  private async doInit(): Promise<void> {
    try {
      logger.info('[WordSegmentation] 开始初始化 jieba 分词器...');
      const startTime = Date.now();
      
      // 加载字典并创建 Jieba 实例
      this.jieba = Jieba.withDict(dict);
      
      const elapsed = Date.now() - startTime;
      this.isInitialized = true;
      
      logger.info(`[WordSegmentation] jieba 分词器初始化完成，耗时 ${elapsed}ms`);
    } catch (error) {
      logger.error('[WordSegmentation] jieba 分词器初始化失败', error);
      this.jieba = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * 分词（精确模式）
   * @param text 待分词的文本
   * @returns 分词结果数组
   */
  public async cut(text: string): Promise<string[]> {
    try {
      // 确保已初始化
      await this.init();
      
      if (!this.jieba) {
        logger.warn('[WordSegmentation] jieba 未初始化，使用降级方案');
        return this.fallbackCut(text);
      }
      
      // 使用精确模式分词
      const words = this.jieba.cut(text, false);
      return words;
    } catch (error) {
      logger.error('[WordSegmentation] 分词失败', error);
      return this.fallbackCut(text);
    }
  }

  /**
   * 计算词频
   * @param texts 文本数组
   * @returns 词频统计结果
   */
  public async calculateWordFrequency(texts: string[]): Promise<Record<string, number>> {
    try {
      logger.info('[WordSegmentation] 开始计算词频', { textCount: texts.length });
      
      // 确保已初始化
      await this.init();
      
      if (!this.jieba) {
        logger.warn('[WordSegmentation] jieba 未初始化，使用降级方案');
        return this.fallbackCalculateWordFrequency(texts);
      }
      
      const wordFrequency: Record<string, number> = {};
      
      for (const text of texts) {
        const words = this.jieba.cut(text, false);
        
        for (const word of words) {
          const trimmedWord = word.trim();
          // 过滤空白和单字符
          if (trimmedWord && trimmedWord.length >= 2) {
            wordFrequency[trimmedWord] = (wordFrequency[trimmedWord] || 0) + 1;
          }
        }
      }
      
      logger.info('[WordSegmentation] 词频计算完成', {
        wordCount: Object.keys(wordFrequency).length,
        topWords: Object.entries(wordFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
      });
      
      return wordFrequency;
    } catch (error) {
      logger.error('[WordSegmentation] 词频计算失败', error);
      return this.fallbackCalculateWordFrequency(texts);
    }
  }

  /**
   * 降级方案：简单分词（按标点符号拆分）
   */
  private fallbackCut(text: string): string[] {
    return text.split(/[\s,，。！？、；：""''（）【】《》]+/).filter(w => w.trim());
  }

  /**
   * 降级方案：计算词频（按标点符号拆分）
   */
  private fallbackCalculateWordFrequency(texts: string[]): Record<string, number> {
    logger.info('[WordSegmentation] 使用降级方案计算词频');
    
    const wordFrequency: Record<string, number> = {};
    
    for (const text of texts) {
      const words = this.fallbackCut(text);
      
      for (const word of words) {
        if (word.trim() && word.trim().length >= 2) {
          wordFrequency[word.trim()] = (wordFrequency[word.trim()] || 0) + 1;
        }
      }
    }
    
    logger.info('[WordSegmentation] 降级方案词频计算完成', {
      wordCount: Object.keys(wordFrequency).length,
      topWords: Object.entries(wordFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    });
    
    return wordFrequency;
  }

  /**
   * 获取服务状态
   */
  public getStatus(): { initialized: boolean; hasJieba: boolean } {
    return {
      initialized: this.isInitialized,
      hasJieba: this.jieba !== null,
    };
  }
}

// 导出单例实例
export const wordSegmentation = WordSegmentationService.getInstance();

// 自动初始化（模块导入时执行）
wordSegmentation.getStatus(); // 触发实例创建，自动初始化会在首次使用时进行
