const { createReportService } = require('./domains/assessments/reports')
const { createAssessmentService } = require('./domains/assessments/service')
const { createOperations } = require('./domains/operations/service')
const { createRuntime } = require('./app/bootstrap/index')
const environment = require('./core/config/environment')
const { resolveEnvironment } = require('./core/config/environment-resolver')
const { createDomainService } = require('./domains/shared/service')
const { parseEntry } = require('./app/training/entry')
const { createTrainingService } = require('./domains/training/service')
App({
  onLaunch(options) {
    try {const {origin}=resolveEnvironment(wx,environment)
    this.runtime = createRuntime(wx,origin,{studentOnly:true})
    this.runtime.training = createTrainingService(this.runtime.api,this.runtime.session)
    this.runtime.reports = createReportService(this.runtime.api,this.runtime.session)
    this.runtime.assessments = createAssessmentService(this.runtime.api,this.runtime.session,this.runtime.drafts,this.runtime.config)
    this.runtime.domains = createDomainService(this.runtime.api,this.runtime.session)
    this.runtime.operations = createOperations(this.runtime.api,this.runtime.session)
    this.runtime.domains.operations = this.runtime.operations
    this.pendingEntry = null
    this.captureEntry(options)
    this.ready = this.runtime.session.restore(); this.ready.catch(() => {})
    } catch(error) {this.runtime=null;this.entryError=error.message;this.ready=Promise.reject(error);this.ready.catch(()=>{})}
  },
  captureEntry(options) {
    try {const entry = parseEntry(options && options.query,this.runtime.config.origin); if(entry) this.pendingEntry = entry; this.entryError = null}
    catch(error) {this.entryError = error.message}
  },
  onShow(options) {
    if(!this.runtime)return
    this.captureEntry(options)
    if(this.hiddenAt && Date.now() - this.hiddenAt > 30000) {
      this.ready = this.runtime.session.refresh(); this.ready.catch(() => {})
    }
    if(this.hiddenAt && (this.pendingEntry || this.entryError)) wx.reLaunch({url:'/pages/entry/index'})
    this.hiddenAt = null
  },
  onHide() {this.hiddenAt = Date.now()},
})
