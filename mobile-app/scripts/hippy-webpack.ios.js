const path = require('path');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const webpack = require('webpack');

const pkg = require('../package.json');
const {
  createDefinePlugin,
  createModuleRules,
  createResolve,
  VueLoaderPlugin,
} = require('./webpack-shared');

const platform = 'ios';

module.exports = {
  mode: 'production',
  bail: true,
  entry: {
    index: ['@hippy/rejection-tracking-polyfill', path.resolve(pkg.nativeMain)],
  },
  output: {
    filename: `[name].${platform}.js`,
    path: path.resolve(__dirname, '..', 'dist', platform),
    globalObject: '(0, eval)("this")',
  },
  plugins: [
    createDefinePlugin(platform, 'production'),
    new CaseSensitivePathsPlugin(),
    new VueLoaderPlugin(),
    new webpack.DllReferencePlugin({
      context: path.resolve(__dirname, '..'),
      manifest: require('../dist/ios/vendor-manifest.json'),
    }),
  ],
  module: {
    rules: createModuleRules({ production: true }),
  },
  resolve: createResolve(),
};
