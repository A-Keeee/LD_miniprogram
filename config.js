import { cloudConfig, config } from './config/index.js';

/** 与 `config/index.js` 对齐：API 基址使用 LD_backend（与云端推理等一致）。 */
export default {
  isMock: config.useMock,
  baseUrl: cloudConfig.localBackendBaseUrl,
};
