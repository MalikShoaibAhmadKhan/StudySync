const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

class ForceExternalsPlugin {
  apply(compiler) {
    compiler.options.externals = [
      /^[a-z@]/
    ];
    compiler.options.externalsType = 'commonjs';
  }
}

module.exports = {
  output: {
    path: join(__dirname, '../dist/backend'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
    }),
    new ForceExternalsPlugin(),
  ],
};
