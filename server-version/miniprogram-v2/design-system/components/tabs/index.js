Component({properties:{items:{type:Array,value:[]},active:String},methods:{select(event){this.triggerEvent('change',{key:event.currentTarget.dataset.key})}}})
