Component({
  properties: { postcard: { type: Object, value: null } },
  methods: {
    open() { this.triggerEvent('open', { postcard: this.data.postcard }); },
  },
});
