const { navigationFor, navigate } = require('../navigation/index')
const { destination } = require('../router/index')
const { pageState } = require('../../core/state/page')
function workspacePage(spec) {
  return Object.assign({
    data: pageState('idle',{navItems:[],title:'Huisurvey',description:''}),
    onLoad(options) {
      this.options = options || {}; this.sequence = 0; this.resultKeys = []
      this.unsubscribe = getApp().runtime.session.subscribe(state => {
        if (!state.user) {this.sequence += 1; const cleared = Object.fromEntries(this.resultKeys.map(key => [key, Array.isArray(this.data[key]) ? [] : null])); this.setData(Object.assign(cleared, pageState('loading', {navItems:[],title:'Huisurvey',description:''}))); wx.reLaunch({url:destination(state)})}
      })
      if (spec.setup) spec.setup.call(this,options || {})
    },
    async onShow() {
      try {
        await getApp().ready
        const session = getApp().runtime.session.get()
        if (!session.user || session.user.mustChangePassword) {wx.reLaunch({url:destination(session)}); return}
        this.setData({navItems:navigationFor(session)})
        await this.load()
      } catch(error) {this.setData(pageState('error',{errorMessage:error.message}))}
    },
    async load(refresh = false) {
      const sequence = ++this.sequence
      this.setData(pageState(refresh ? 'refreshing' : 'loading'))
      try {
        const result = await spec.fetch.call(this,getApp().runtime)
        if (sequence !== this.sequence) return
        this.resultKeys = Object.keys(result)
        this.setData(pageState(result.empty ? 'empty' : 'ready',result))
      } catch(error) {if (sequence === this.sequence) this.setData(pageState('error',{errorMessage:error.message}))}
      finally {if (refresh) wx.stopPullDownRefresh()}
    },
    onPullDownRefresh() {return this.load(true)},
    retry() {return this.load()},
    navigate(event) {navigate(wx,getApp().runtime.session.get(),event.detail.key)},
    onUnload() {this.sequence += 1; if(this.unsubscribe) this.unsubscribe()},
  },spec.methods || {})
}
module.exports = { workspacePage }
