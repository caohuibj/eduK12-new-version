Component({properties:{disabled:Boolean,loading:Boolean,secondary:Boolean},methods:{press(){if(!this.data.disabled&&!this.data.loading)this.triggerEvent('press')}}})
