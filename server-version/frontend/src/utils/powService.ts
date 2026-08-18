/**
 * POW (Proof of Work) 服务
 * 用于防止机器人滥用，前端计算挑战
 */

export interface POWChallenge {
  challenge: string
  difficulty: number
}

export interface POWResponse {
  challenge: string
  proof: string
  difficulty: number
}

/**
 * SHA256 哈希计算（浏览器原生支持）
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 计算 POW（找到满足难度的 nonce）
 * @param challenge 挑战字符串
 * @param difficulty 难度（前导零数量）
 * @returns 计算结果（proof）
 */
export async function solvePOW(challenge: string, difficulty: number): Promise<string> {
  const target = '0'.repeat(difficulty)
  let nonce = 0
  
  // 使用 Web Worker 或异步计算避免阻塞
  const maxIterations = 1000000 // 最大迭代次数，防止无限循环
  
  while (nonce < maxIterations) {
    const hash = await sha256(`${challenge}${nonce}`)
    
    if (hash.startsWith(target)) {
      console.log(`[POW] 找到解: nonce=${nonce}, hash=${hash.substring(0, 16)}...`)
      return nonce.toString()
    }
    
    nonce++
    
    // 每隔1000次让出控制权，避免阻塞UI
    if (nonce % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  
  throw new Error('POW 计算超时')
}

/**
 * 从服务器获取 POW 挑战
 */
export async function fetchChallenge(): Promise<POWChallenge> {
  const response = await fetch('/api/public/pow/challenge')
  if (!response.ok) {
    throw new Error('获取 POW 挑战失败')
  }
  const data = await response.json()
  return data.data
}

/**
 * 完整的 POW 流程（获取挑战 -> 计算解 -> 返回结果）
 */
export async function completePOW(): Promise<POWResponse> {
  console.log('[POW] 开始计算挑战...')
  
  const startTime = Date.now()
  
  // 1. 获取挑战
  const { challenge, difficulty } = await fetchChallenge()
  
  console.log(`[POW] 挑战: ${challenge}, 难度: ${difficulty}`)
  
  // 2. 计算解
  const proof = await solvePOW(challenge, difficulty)
  
  const elapsed = Date.now() - startTime
  console.log(`[POW] 计算完成，耗时: ${elapsed}ms`)
  
  return {
    challenge,
    proof,
    difficulty
  }
}
