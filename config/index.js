/** 是否使用 mock 拦截 wx.request（关闭后走 LD_backend 等真实地址） */
export const config = {
  useMock: false,
};

export const cloudConfig = {
  /**
   * 本地 Flask（默认 PORT=5000）。需先启动 LD_backend，否则登录/视频接口会报 500 或连接失败。
   * 真机预览请改为电脑局域网 IP（如 http://192.168.x.x:5000），并勾选「不校验合法域名」。
   */
  localBackendBaseUrl: 'https://api.ldinnovation.xyz',
  /** 开启「云端同步」时轮询 /api/pet/status 的间隔（毫秒） */
  statusPollIntervalMs: 1500,
};

export default { config, cloudConfig };
