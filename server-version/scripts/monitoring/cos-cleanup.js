#!/usr/bin/env node
/**
 * COS 备份清理工具 - 按文件名日期清理
 */

const path = require('path');
const backendNodeModules = path.join(__dirname, '../../backend/node_modules');
if (require('fs').existsSync(backendNodeModules)) {
  module.paths.unshift(backendNodeModules);
}

const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');

// 读取配置
function loadConfig() {
  const envPath = path.join(__dirname, '../../backend/.env');
  const config = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) config[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  });
  return config;
}

async function cleanupByFilename(daysToKeep) {
  const config = loadConfig();
  const cos = new COS({ SecretId: config.COS_SECRET_ID, SecretKey: config.COS_SECRET_KEY });
  const bucket = config.COS_BUCKET;
  const region = config.COS_REGION;
  const prefix = 'backups/ptool/';

  // 获取所有文件
  const result = await new Promise((resolve, reject) => {
    cos.getBucket({ Bucket: bucket, Region: region, Prefix: prefix, MaxKeys: 1000 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const files = result.Contents || [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysToKeep));
  const cutoffStr = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');

  const toDelete = [];
  files.forEach(f => {
    // 从文件名提取日期：ptool_full_20260212_020002_configs.tar.gz.enc
    const match = f.Key.match(/_(\d{8})_/);
    if (match) {
      const fileDate = match[1];
      if (fileDate < cutoffStr) {
        toDelete.push({ Key: f.Key });
      }
    }
  });

  console.log(JSON.stringify({
    total: files.length,
    toDelete: toDelete.length,
    cutoffDate: cutoffStr
  }));

  if (toDelete.length > 0) {
    await new Promise((resolve, reject) => {
      cos.deleteMultipleObject({ Bucket: bucket, Region: region, Objects: toDelete }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    console.log(JSON.stringify({ deleted: toDelete.length }));
  }
}

const days = process.argv[2] || 5;
cleanupByFilename(days).catch(console.error);
