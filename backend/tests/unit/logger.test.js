const logger = require('../../src/utils/logger');

describe('Logger Utility', () => {
  it('should exist', () => {
    expect(logger).toBeDefined();
  });

  it('should have info and error methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
