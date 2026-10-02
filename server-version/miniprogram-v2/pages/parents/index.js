const { workspacePage } = require('../../app/pages/index')
Page(workspacePage({
  setup(options) {
    this.viewOptions={view:options.view||'children',next:options.next,childId:options.childId,artifactId:options.artifactId,relationshipId:options.relationshipId}
    this.page=1
    this.setData({view:this.viewOptions.view,inviteInput:'',invitation:null,inviteCourses:[],confirmation:null,actionError:'',notice:''})
  },
  reset() {this.setData({inviteInput:'',invitation:null,inviteCourses:[],confirmation:null,preview:null,report:null,reportBlocks:[],actionError:'',notice:''})},
  async fetch(runtime) {this.page=1;this.setData({confirmation:null});return runtime.parents.view(this.viewOptions)},
  methods:{
    onHide(){this.sequence+=1;this.setData({confirmation:null,preview:null,report:null,reportBlocks:[],notice:'',actionError:''})},
    input(event) {this.setData({inviteInput:event.detail.value})},
    async act(operation,refresh=false) {
      if(this.data.status==='submitting')return
      const sequence=this.sequence
      this.setData({status:'submitting',actionError:''})
      try {
        const result=await operation(getApp().runtime.parents)
        if(sequence!==this.sequence)return
        this.setData(Object.assign({status:'ready'},result||{}))
        if(refresh)await this.load()
      } catch(error) {if(sequence===this.sequence)this.setData({status:'ready',actionError:error.message})}
    },
    chooseCourse() {if(this.data.canInvite)return this.act(async service=>({inviteCourses:await service.inviteCourses(),invitation:null}))},
    invite(event) {
      if(!this.data.canInvite)return
      const id=event.currentTarget.dataset.id
      return this.act(async service=>({invitation:await service.invite(id),inviteCourses:[]}))
    },
    copyInvite() {
      if(this.data.invitation)wx.setClipboardData({data:this.data.invitation.inviteCode})
    },
    claim() {
      if(!this.data.canClaim)return
      const code=this.data.inviteInput.trim();this.setData({inviteInput:''})
      return this.act(async service=>{await service.claim(code);return {}},true)
    },
    confirmLink(event) {
      if(this.data.status==='submitting')return
      const {id,action}=event.currentTarget.dataset
      const link=(this.data.links||[]).find(row=>row.id===id)
      if(!link||(action==='approve'?!link.canApprove:!link.canRevoke))return
      this.setData({confirmation:{id,action,title:action==='approve'?'确认关联家长':'解除关联',text:action==='approve'?this.data.consent.text:'解除后停止新的孩子概况与报告访问。历史授权记录保留。'}})
    },
    confirmReport() {
      if(this.data.report?.canRevoke&&this.data.status!=='submitting')this.setData({confirmation:{id:this.data.report.relationshipId,artifactId:this.data.report.artifactId,action:'withdraw',title:'撤回报告授权',text:'撤回这份报告的既有同意与披露授权后，停止新的访问。家长关联和其他报告授权保留。'}})
    },
    dismiss() {if(this.data.status!=='submitting')this.setData({confirmation:null})},
    confirm() {
      const c=this.data.confirmation
      if(!c)return
      return this.act(async service=>{
        if(c.action==='approve')await service.approve(c.id,this.data.consent.version)
        else if(c.action==='withdraw')await service.withdraw(c.id,c.artifactId)
        else await service.revoke(c.id)
        return {confirmation:null,report:null,notice:c.action==='withdraw'?'已撤回本份报告授权，家长关联和其他报告授权保留。':''}
      },c.action!=='withdraw'||this.viewOptions.view==='consent')
    },
    accept() {
      if(!this.data.preview||this.data.preview.canConsent!==true)return
      return this.act(async service=>{await service.accept(this.data.preview);return {notice:'已记录本份报告的同意。还需报告披露授权后，家长才可查看。'}},true)
    },
    reportOptions(e){const row=this.data.links?.find(r=>r.id===e.currentTarget.dataset.id);if(row?.canConsentReports)wx.navigateTo({url:'/pages/parents/index?view=reportOptions&relationshipId='+encodeURIComponent(row.id)})},
    select(event) {
      if(this.viewOptions.view==='reportOptions'){const row=this.data.list.find(r=>r.id===event.detail.id);if(row?.canOpen)wx.navigateTo({url:'/pages/parents/index?view=consent&relationshipId='+encodeURIComponent(this.viewOptions.relationshipId)+'&artifactId='+encodeURIComponent(row.id)});return}
      const id=event.detail.id
      const view=this.viewOptions.view==='children'?(this.viewOptions.next==='reports'?'reports':'child'):'report'
      const query=view==='report'?'&childId='+encodeURIComponent(this.viewOptions.childId)+'&artifactId='+encodeURIComponent(id):'&childId='+encodeURIComponent(id)
      wx.navigateTo({url:'/pages/parents/index?view='+view+query})
    },
    reports() {wx.navigateTo({url:'/pages/parents/index?view=reports&childId='+encodeURIComponent(this.viewOptions.childId)})},
    async more() {
      if(!this.data.hasMore)return
      return this.act(async service=>{const result=await service.view(this.viewOptions,this.page+1);this.page+=1;return {list:this.data.list.concat(result.list),hasMore:result.hasMore}})
    },
  },
}))
