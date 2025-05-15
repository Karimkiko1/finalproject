module.exports = {
  entry: './frontend/src/index.js',
  output: {
    path: __dirname + '/frontend/dist',
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/, // مهم إنه يشمل .jsx
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  mode: 'development'
};
