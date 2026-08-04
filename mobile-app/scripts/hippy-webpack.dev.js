const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const pkg = require('../package.json');
const {
  createDefinePlugin,
  createModuleRules,
  createResolve,
  VueLoaderPlugin,
} = require('./webpack-shared');

module.exports = {
  mode: 'development',
  devtool: 'eval-source-map',
  watch: true,
  watchOptions: {
    aggregateTimeout: 300,
  },
  devServer: {
    remote: {
      protocol: 'http',
      host: process.env.DEV_HOST || '127.0.0.1',
      port: Number(process.env.DEV_PORT || 38989),
    },
    vueDevtools: false,
    multiple: false,
    hot: true,
    liveReload: true,
    client: {
      overlay: false,
    },
    devMiddleware: {
      writeToDisk: true,
    },
  },
  entry: {
    index: ['@hippy/rejection-tracking-polyfill', path.resolve(pkg.nativeMain)],
  },
  output: {
    filename: 'index.bundle',
    strictModuleExceptionHandling: true,
    path: path.resolve(__dirname, '..', 'dist', 'dev'),
    globalObject: '(0, eval)("this")',
  },
  plugins: [
    new VueLoaderPlugin(),
    createDefinePlugin(null, 'development'),
    new CleanWebpackPlugin(),
  ],
  module: {
    rules: createModuleRules(),
  },
  resolve: createResolve(),
};
