Component({
  properties: {
    tabs: {
      type: Array,
      value: []
    },
    activeTab: {
      type: String,
      value: ''
    },
    showBadge: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    onTabTap(e) {
      const { tab } = e.currentTarget.dataset
      this.triggerEvent('change', { tab })
    }
  }
})
