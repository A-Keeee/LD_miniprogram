Component({
  properties: {
    friend: { type: Object, value: null },
  },
  methods: {
    open() {
      this.triggerEvent('open', { friend: this.data.friend });
    },
  },
});
