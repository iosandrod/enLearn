const path = require('path');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const webpack = require('webpack');

const {
  createDefinePlugin,
  createModuleRules,
  createResolve,
  VueLoaderPlugin,
} = require('./webpack-shared');

const platform = 'android';

module.exports = {
  mode: 'production',
  bail: true,
  entry: {
    vendor: [path.resolve(__dirname, 'vendor.js')],
  },
  output: {
    filename: `[name].${platform}.js`,
    path: path.resolve(__dirname, '..', 'dist', platform),
    globalObject: '(0, eval)("this")',
    library: 'hippyVueBase',
  },
  plugins: [
    createDefinePlugin(platform, 'production'),
    new CaseSensitivePathsPlugin(),
    new VueLoaderPlugin(),
    new webpack.DllPlugin({
      context: path.resolve(__dirname, '..'),
      path: path.resolve(__dirname, '..', 'dist', platform, '[name]-manifest.json'),
      name: 'hippyVueBase',
    }),
  ],
  module: {
    rules: createModuleRules({ production: true }),
  },
  resolve: createResolve(),
};
