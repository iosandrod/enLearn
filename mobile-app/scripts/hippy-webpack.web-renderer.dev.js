const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const pkg = require('../package.json');
const {
  createDefinePlugin,
  createModuleRules,
  createResolve,
  VueLoaderPlugin,
} = require('./webpack-shared');

module.exports = {
  mode: 'development',
  devtool: 'source-map',
  devServer: {
    host: '0.0.0.0',
    port: 3100,
    hot: true,
    liveReload: true,
    client: {
      overlay: {
        errors: true,
        warnings: true,
        runtimeErrors: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          return message !== 'ResizeObserver loop completed with undelivered notifications.'
            && message !== 'ResizeObserver loop limit exceeded';
        },
      },
    },
  },
  entry: {
    index: ['regenerator-runtime/runtime', path.resolve(pkg.webMain)],
  },
  output: {
    filename: 'index.bundle.js',
    path: path.resolve(__dirname, '..', 'dist', 'web'),
    globalObject: '(0, eval)("this")',
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      inject: true,
      scriptLoading: 'blocking',
      template: path.resolve(__dirname, '..', 'public', 'web-renderer.html'),
    }),
    createDefinePlugin('web', 'development'),
    new CleanWebpackPlugin(),
  ],
  module: {
    rules: createModuleRules(),
  },
  resolve: createResolve(),
};
