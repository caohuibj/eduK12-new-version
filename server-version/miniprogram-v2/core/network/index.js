function createNetwork(platform) {
  let online = true
  const update = result => { online = result.isConnected !== undefined ? result.isConnected : result.networkType !== 'none' }
  if (platform.getNetworkType) platform.getNetworkType({success: update})
  if (platform.onNetworkStatusChange) platform.onNetworkStatusChange(update)
  return { isOnline: () => online }
}
module.exports = { createNetwork }
