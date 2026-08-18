const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')
const path = require('path')

const config = {
  SecretId: 'AKIDz32xrfMtGQQK7pP2a3Po5aGvTpGXgeR4',
  SecretKey: 'YG1pXIxcKuRmy0ibO5pS9iO1UrBWluBX',
  Bucket: 'ptool-videos-edu-1393949445',
  Region: 'ap-beijing'
}

const cos = new COS(config)

const imagesDir = '/opt/ptool/server-version/backend/uploads/images'

async function uploadFile(filePath, key) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.Bucket,
      Region: config.Region,
      Key: key,
      FilePath: filePath
    }, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

async function main() {
  const files = fs.readdirSync(imagesDir)
  
  console.log(`Found ${files.length} files`)
  
  for (const file of files) {
    const filePath = path.join(imagesDir, file)
    const key = `images/${file}`
    
    console.log(`Uploading: ${file}...`)
    try {
      await uploadFile(filePath, key)
      console.log(`  ✓ Uploaded: ${file}`)
    } catch (err) {
      console.error(`  ✗ Failed: ${file}`, err.message)
    }
  }
  
  console.log('Done!')
}

main()
