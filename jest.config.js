module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/node_modules_windows/'],
  modulePathIgnorePatterns: ['<rootDir>/node_modules_windows/']
};
