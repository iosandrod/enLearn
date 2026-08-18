const path = require('path');
const webpack = require('webpack');
const { VueLoaderPlugin } = require('vue-loader');

const loadEnv = require('./load-env');

function createDefinePlugin(platform, mode) {
  const env = loadEnv();

  return new webpack.DefinePlugin({
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.ENLEARN_API_BASE_URL': JSON.stringify(
      env.ENLEARN_API_BASE_URL || 'http://127.0.0.1:3002/api'
    ),
    'process.env.ENLEARN_MOBILE_PAGE_CODE': JSON.stringify(
      env.ENLEARN_MOBILE_PAGE_CODE || 'sales-orders'
    ),
    'process.env.ENLEARN_MOBILE_ACCESS_TOKEN': JSON.stringify(
      env.ENLEARN_MOBILE_ACCESS_TOKEN || ''
    ),
    'process.env.ENLEARN_MOBILE_ACCOUNT_ID': JSON.stringify(
      env.ENLEARN_MOBILE_ACCOUNT_ID || ''
    ),
    'process.env.ENLEARN_MOBILE_USER_ID': JSON.stringify(
      env.ENLEARN_MOBILE_USER_ID || ''
    ),
    __PLATFORM__: JSON.stringify(platform),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
    'globalThis.__VUE_OPTIONS_API__': false,
    'globalThis.__VUE_PROD_DEVTOOLS__': false,
    'globalThis.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__': false,
  });
}

function createModuleRules({ production = false } = {}) {
  return [
    {
      test: /\.vue$/,
      use: [
        {
          loader: 'vue-loader',
          options: {
            compilerOptions: {
              hoistStatic: false,
              whitespace: 'condense',
            },
          },
        },
      ],
    },
    {
      test: /\.(le|c)ss$/,
      use: ['@hippy/vue-css-loader', 'less-loader'],
    },
    {
      test: /\.m?[jt]s$/,
      exclude: /node_modules/,
      use: production
        ? [
            {
              loader: 'babel-loader',
              options: {
                sourceType: 'unambiguous',
                presets: [['@babel/preset-env', { targets: { chrome: 57 } }]],
                plugins: [
                  '@babel/plugin-proposal-class-properties',
                  ['@babel/plugin-proposal-decorators', { legacy: true }],
                  ['@babel/plugin-transform-runtime', { regenerator: true }],
                ],
              },
            },
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                appendTsSuffixTo: [/\.vue$/],
              },
            },
          ]
        : [
            {
              loader: 'esbuild-loader',
              options: {
                loader: 'ts',
                target: 'es2018',
              },
            },
          ],
    },
    {
      test: /\.(png|jpe?g|gif)$/i,
      type: 'asset',
      parser: {
        dataUrlCondition: {
          maxSize: 8 * 1024,
        },
      },
      generator: {
        filename: 'assets/[name][ext]',
      },
    },
    {
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
    },
  ];
}

function createResolve() {
  return {
    extensions: ['.ts', '.js', '.vue', '.json'],
    alias: {
      src: path.resolve(__dirname, '..', 'src'),
      vue$: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  };
}

module.exports = {
  createDefinePlugin,
  createModuleRules,
  createResolve,
  VueLoaderPlugin,
};
