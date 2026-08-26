const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')
const path = require('path')

const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} must be set before uploading files to COS`)
  }
  return value.trim()
}

const config = {
  SecretId: requiredEnv('COS_SECRET_ID'),
  SecretKey: requiredEnv('COS_SECRET_KEY'),
  Bucket: requiredEnv('COS_BUCKET'),
  Region: requiredEnv('COS_REGION')
}

const cos = new COS(config)

const imagesDir = process.env.UPLOAD_IMAGES_DIR || '/opt/ptool/server-version/backend/uploads/images'

async function uploadFile(filePath, key) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: config.Bucket,
      Region: config.Region,
      Key: key,
      Body: fs.createReadStream(filePath)
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
