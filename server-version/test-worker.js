/**
 * 直接测试视频处理 Worker
 */
const { videoQueue } = require('./backend/dist/config/queue');
const { prisma } = require('./backend/dist/config/database');
const path = require('path');

async function testWorker() {
  console.log('========================================');
  console.log('  视频处理 Worker 测试');
  console.log('========================================\n');

  // 检查队列连接
  console.log('1. 检查 Redis 连接...');
  try {
    const jobCounts = await videoQueue.getJobCounts();
    console.log('   ✅ Redis 连接成功');
    console.log('   队列状态:', jobCounts);
  } catch (err) {
    console.log('   ❌ Redis 连接失败:', err.message);
    process.exit(1);
  }

  // 创建测试视频记录
  console.log('\n2. 创建测试视频记录...');
  const testVideoPath = path.resolve(__dirname, 'test-videos/test-1080p.mp4');
  
  try {
    // 先创建一个测试用户（如果不存在）
    let testUser = await prisma.user.findFirst({
      where: { username: 'test_worker' }
    });

    if (!testUser) {
      const { hashPassword } = require('./backend/dist/utils/password');
      testUser = await prisma.user.create({
        data: {
          username: 'test_worker',
          passwordHash: await hashPassword('test123'),
          role: 'TEACHER',
          nickname: '测试教师',
        }
      });
      console.log('   创建测试用户:', testUser.id);
    }

    // 创建视频记录
    const video = await prisma.video.create({
      data: {
        title: 'Worker测试视频-' + Date.now(),
        filePath: testVideoPath,
        fileName: 'test-1080p.mp4',
        fileSize: 241000,
        mimeType: 'video/mp4',
        teacherId: testUser.id,
        originalUrl: `file://${testVideoPath}`,
        status: 'PENDING',
      }
    });
    console.log('   ✅ 视频记录创建成功, ID:', video.id);

    // 添加到处理队列
    console.log('\n3. 添加到处理队列...');
    const job = await videoQueue.add('transcode', {
      videoId: video.id,
      originalUrl: `file://${testVideoPath}`,
      teacherId: testUser.id,
    }, {
      delay: 1000,
    });
    console.log('   ✅ 任务已添加, Job ID:', job.id);

    // 等待处理完成
    console.log('\n4. 等待处理完成 (最多60秒)...');
    const startTime = Date.now();
    
    while (Date.now() - startTime < 60000) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const updatedVideo = await prisma.video.findUnique({
        where: { id: video.id }
      });
      
      console.log(`   状态: ${updatedVideo.status}, 进度检查...`);
      
      if (updatedVideo.status === 'COMPLETED') {
        console.log('\n   ✅ 视频处理完成!');
        console.log('   处理后的URL:', updatedVideo.processedUrl);
        console.log('   缩略图URL:', updatedVideo.thumbnailUrl);
        console.log('   分辨率:', updatedVideo.resolution);
        console.log('   时长:', updatedVideo.duration, '秒');
        break;
      }
      
      if (updatedVideo.status === 'FAILED') {
        console.log('\n   ❌ 视频处理失败!');
        console.log('   错误:', updatedVideo.errorMessage);
        break;
      }
    }

    console.log('\n========================================');
    console.log('  测试完成');
    console.log('========================================');

  } catch (err) {
    console.error('测试失败:', err);
  } finally {
    await prisma.$disconnect();
    await videoQueue.close();
  }
}

testWorker();
