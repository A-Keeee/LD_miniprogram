import config from '~/config';

const { baseUrl } = config;
const delay = config.isMock ? 500 : 0;

function request(url, method = 'GET', data = {}) {
  const header = {
    'content-type': 'application/json',
  };
  const tokenString = wx.getStorageSync('access_token');
  if (tokenString) {
    header.Authorization = `Bearer ${tokenString}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: baseUrl + url,
      method,
      data,
      dataType: 'json',
      header,
      success(res) {
        setTimeout(() => {
          const payload = res.data !== undefined ? res.data : res;
          const httpOk =
            res.statusCode === undefined ||
            (res.statusCode >= 200 && res.statusCode < 300);
          if (httpOk && payload && payload.success && payload.code === 200) {
            resolve(payload);
          } else if (httpOk && payload && payload.success) {
            resolve(payload);
          } else {
            reject(res);
          }
        }, delay);
      },
      fail(err) {
        setTimeout(() => {
          reject(err);
        }, delay);
      },
    });
  });
}

export default request;
