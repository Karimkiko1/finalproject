const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    publicPath: '/',
    clean: true
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
      fallback: { "querystring": require.resolve("querystring-es3") }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html'
    }),
    new webpack.DefinePlugin({
      'process.env': {
        REACT_APP_GOOGLE_CLIENT_ID: JSON.stringify(process.env.REACT_APP_GOOGLE_CLIENT_ID),
        REACT_APP_GOOGLE_API_KEY: JSON.stringify(process.env.REACT_APP_GOOGLE_API_KEY)
      }
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist')
    },
    hot: true,
    historyApiFallback: true,
    port: 5000
  }
};
