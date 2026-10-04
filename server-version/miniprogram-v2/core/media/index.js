const { ApiError } = require('../errors/index')
function createMedia(platform,privacy) {
  let selecting=false
  return {
    async chooseImages(count,canContinue=()=>true) {
      if (selecting) throw new ApiError('busy','正在选择图片，请稍候')
      if (!Number.isInteger(count)||count<1||count>9) throw new ApiError('invalidRequest','图片数量须为 1 至 9 张')
      selecting=true
      try {
        if(!canContinue())throw new ApiError('cancelled','已取消选图')
        await privacy.ensure(canContinue)
        if(!canContinue())throw new ApiError('cancelled','已取消选图')
        if (!platform.chooseMedia) throw new ApiError('unsupportedPlatform','当前微信版本不支持选图，请升级微信')
        const result=await new Promise((resolve,reject)=>platform.chooseMedia({
          count,mediaType:['image'],sizeType:['compressed'],sourceType:['album','camera'],
          success:resolve,fail:error=>reject(new ApiError(/cancel/i.test(error?.errMsg||'')?'cancelled':'mediaUnavailable',
            /cancel/i.test(error?.errMsg||'')?'已取消选图':'无法选择图片，请检查相册或相机权限后重试'))}))
        if(!canContinue())throw new ApiError('cancelled','已取消选图')
        if (!Array.isArray(result.tempFiles)||!result.tempFiles.length||result.tempFiles.length>count) throw new ApiError('mediaUnavailable','选图结果无效，请重试')
        for (const file of result.tempFiles) {
          if (!file||typeof file.tempFilePath!=='string'||!file.tempFilePath||file.fileType&&file.fileType!=='image') throw new ApiError('mediaUnavailable','请选择图片文件')
          if (!Number.isFinite(file.size)||file.size<1||file.size>10*1024*1024) throw new ApiError('invalidRequest','单张图片须大于 0 字节且不超过 10 MB')
        }
        return result.tempFiles
      } finally {selecting=false}
    },
  }
}
module.exports={createMedia}
