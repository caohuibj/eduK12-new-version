Component({properties:{items:{type:Array,value:[]}},methods:{select(event){const value=event.currentTarget.dataset;if(value.open)this.triggerEvent('select',{id:value.id,domain:value.domain})}}})
