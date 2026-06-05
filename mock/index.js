import Mock from './WxMock';
import loginMock from './login/index';
import homeMock from './home/index';

export default () => {
  const mockData = [...loginMock, ...homeMock];
  mockData.forEach((item) => {
    Mock.mock(item.path, { code: 200, success: true, data: item.data });
  });
};
