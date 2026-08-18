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

const platform = 'android';

module.exports = {
  mode: 'production',
  bail: true,
  entry: {
    index: [path.resolve(pkg.nativeMain)],
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
      manifest: require('../dist/android/vendor-manifest.json'),
    }),
  ],
  module: {
    rules: createModuleRules({ production: true }),
  },
  resolve: createResolve(),
};
