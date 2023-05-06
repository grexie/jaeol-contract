require("ts-node").register({
  files: true,
  transpileOnly: true,
});
require("dotenv-flow").config({
  default_node_env: "development",
  path: __dirname,
});
module.exports = {
  contracts_directory: "src/contracts",
  contracts_build_directory: "build",
  migrations_directory: "src/migrations",
  test_directory: "src/tests",
  compilers: {
    solc: {
      version: "^0.8.18",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200,
        },
      },
    },
  },
  networks: {
    polygon: {
      network_id: 137,
    },
    mumbai: {
      network_id: 80001,
    },
  },
  dashboard: {
    port: 24012,
    host: "localhost",
  },
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    polygonscan: process.env.POLYGONSCAN_API_KEY,
  },
  mocha: {
    reporter: "eth-gas-reporter",
    reporterOptions: {
      currency: "USD",
      token: "MATIC",
      excludeContracts: ["Token"],
      src: "src/contracts",
    },
  },
  plugins: ["truffle-plugin-verify"],
};
