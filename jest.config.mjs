export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: [
    "<rootDir>/src/**/*.test.ts",
    "<rootDir>/src/**/*.test.tsx",
    "<rootDir>/server/**/*.test.ts",
  ],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};
