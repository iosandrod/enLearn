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
  mode: 'production',
  bail: true,
  entry: {
    index: ['regenerator-runtime/runtime', path.resolve(pkg.webMain)],
  },
  output: {
    filename: '[name].[contenthash:8].js',
    path: path.resolve(__dirname, '..', 'dist', 'web'),
  },
  plugins: [
    new VueLoaderPlugin(),
    new HtmlWebpackPlugin({
      inject: true,
      scriptLoading: 'blocking',
      template: path.resolve(__dirname, '..', 'public', 'web-renderer.html'),
    }),
    createDefinePlugin('web', 'production'),
    new CleanWebpackPlugin(),
  ],
  module: {
    rules: createModuleRules({ production: true }),
  },
  resolve: createResolve(),
};
