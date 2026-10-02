const { createParentPublicationService } = require('./domains/parents/publication')
const { createReportService } = require('./domains/assessments/reports')
const { createAssessmentService } = require('./domains/assessments/service')
const { createToolPolicyService } = require('./domains/parents/tool-policy')
const { createPublicCheckinService } = require('./domains/public-checkin/service')
const { createClassroomService } = require('./domains/classrooms/service')
const { createOrganizationService } = require('./domains/organizations/service')
const { createOperations } = require('./domains/operations/service')
const { createRuntime } = require('./app/bootstrap/index')
const { origin } = require('./core/config/environment')
const { createDomainService } = require('./domains/shared/service')
const { createWorkspaceService } = require('./workspaces/service')
const { createParentService } = require('./domains/parents/service')
const { parseEntry } = require('./app/entry/index')
App({
  onLaunch(options) {
    this.runtime = createRuntime(wx,origin)
    this.runtime.reports = createReportService(this.runtime.api,this.runtime.session)
    this.runtime.assessments = createAssessmentService(this.runtime.api,this.runtime.session,this.runtime.drafts,this.runtime.config)
    this.runtime.domains = createDomainService(this.runtime.api,this.runtime.session)
    this.runtime.organizations = createOrganizationService(this.runtime.api,this.runtime.session)
    this.runtime.publicCheckins = createPublicCheckinService(this.runtime.api)
    this.runtime.classrooms = createClassroomService(this.runtime.api,this.runtime.session)
    this.runtime.operations = createOperations(this.runtime.api,this.runtime.session)
    this.runtime.domains.operations = this.runtime.operations
    this.runtime.toolPolicies = createToolPolicyService(this.runtime.api,this.runtime.session)
    this.runtime.parentPublications = createParentPublicationService(this.runtime.api,this.runtime.session)
    this.runtime.parents = createParentService(this.runtime.api,this.runtime.session)
    this.runtime.workspaces = createWorkspaceService(this.runtime.domains,this.runtime.session,this.runtime.parents)
    this.pendingEntry = null
    this.captureEntry(options)
    this.ready = this.runtime.session.restore(); this.ready.catch(() => {})
  },
  captureEntry(options) {
    try {const entry = parseEntry(options && options.query,origin); if(entry) this.pendingEntry = entry; this.entryError = null}
    catch(error) {this.entryError = error.message}
  },
  onShow(options) {
    this.captureEntry(options)
    if(this.hiddenAt && Date.now() - this.hiddenAt > 30000) {
      this.ready = this.runtime.session.refresh(); this.ready.catch(() => {})
    }
    if(this.hiddenAt && (this.pendingEntry || this.entryError)) wx.reLaunch({url:'/pages/entry/index'})
    this.hiddenAt = null
  },
  onHide() {this.hiddenAt = Date.now()},
})
